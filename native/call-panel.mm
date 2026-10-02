@class CallPanelController;
@interface IncomingCallPanel : NSPanel
@property (weak) CallPanelController *owner;
@end
@interface CallPanelButton : NSButton
@property NSDictionary *command;
@property NSString *dismissToken;
@end
@implementation CallPanelButton
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (BOOL)needsPanelToBecomeKey { return NO; }
@end
@interface CallPanelController : NSObject
@property IncomingCallPanel *panel;
@property IncomingCallPanel *sheet;
@property (weak) NSWindow *mainWindow;
@property NSDictionary *model;
@property NSArray *renderedCards;
@property BOOL renderedCompact;
@property CGFloat renderedHeight;
@property NSMutableSet<NSString *> *dismissed;
@property NSMutableSet<NSString *> *pending;
@property BOOL rendering;
@property BOOL queued;
@property BOOL disposed;
@property BOOL endingSheet;
@property napi_threadsafe_function callback;
- (void)update:(NSDictionary *)model;
- (void)render;
- (void)dismissAlerts;
- (void)closeMainWindow;
- (BOOL)ownsAlerts;
- (void)dispose;
- (void)finishDispose;
@end
@implementation IncomingCallPanel
- (BOOL)canBecomeMainWindow { return NO; }
- (BOOL)canBecomeKeyWindow { return YES; }
- (void)cancelOperation:(id)sender { [_owner dismissAlerts]; }
- (void)performClose:(id)sender { [_owner closeMainWindow]; }
@end
@implementation CallPanelController
- (instancetype)init {
  if ((self = [super init])) {
    _dismissed = [NSMutableSet set]; _pending = [NSMutableSet set];
    for (NSString *name in @[NSApplicationDidBecomeActiveNotification, NSApplicationDidResignActiveNotification, NSApplicationDidHideNotification, NSApplicationDidUnhideNotification,
      NSApplicationDidChangeScreenParametersNotification, NSWindowDidBecomeKeyNotification, NSWindowDidResignKeyNotification,
      NSWindowDidMiniaturizeNotification, NSWindowDidDeminiaturizeNotification, NSWindowDidChangeOcclusionStateNotification,
      NSWindowDidEndSheetNotification, NSWindowDidResizeNotification]) {
      [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(presentationChanged:) name:name object:nil];
    }
    [NSWorkspace.sharedWorkspace.notificationCenter addObserver:self selector:@selector(presentationChanged:) name:NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification object:nil];
  }
  return self;
}
- (NSString *)token:(NSDictionary *)card { return [NSString stringWithFormat:@"%@:%@", card[@"id"], card[@"callId"]]; }
- (BOOL)foreground {
  return NSApp.active && !NSApp.hidden && _mainWindow.visible && !_mainWindow.miniaturized &&
    (_mainWindow.keyWindow || _sheet.keyWindow || (_sheet && _mainWindow.attachedSheet == _sheet));
}
- (BOOL)canPresentSheet {
  if (![self foreground] || _pending.count || _endingSheet || (_mainWindow.attachedSheet && _mainWindow.attachedSheet != _sheet)) return NO;
  for (NSDictionary *card in _model[@"cards"]) if ([card[@"busy"] boolValue]) return NO;
  return YES;
}
- (BOOL)ownsAlerts { return [_model[@"enabled"] boolValue] || ([_model[@"unlocked"] boolValue] && [self canPresentSheet]); }
- (void)presentationChanged:(NSNotification *)notification {
  if (_disposed || _rendering || _queued) return;
  if ([notification.object isKindOfClass:NSWindow.class] && notification.object != _mainWindow && notification.object != _sheet && notification.object != _panel) return;
  _queued = YES;
  __weak CallPanelController *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    CallPanelController *owner = weakSelf; owner.queued = NO;
    if (!owner.disposed) [owner render];
  });
}
- (void)emit:(NSDictionary *)command {
  NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:command options:0 error:nil] encoding:NSUTF8StringEncoding];
  if (_callback && json) {
    auto *message = new std::string(json.UTF8String);
    if (napi_call_threadsafe_function(_callback, message, napi_tsfn_nonblocking) != napi_ok) delete message;
  }
}
- (void)endSheet {
  if (_sheet.sheetParent) {
    if (!_endingSheet) { _endingSheet = YES; [_sheet.sheetParent endSheet:_sheet]; }
  } else [_sheet orderOut:nil];
}
- (void)dismissAlerts {
  for (NSDictionary *card in _model[@"cards"]) [_dismissed addObject:[self token:card]];
  [self render];
}
- (void)closeMainWindow { [self endSheet]; [_mainWindow orderOut:nil]; [self render]; }
- (void)act:(CallPanelButton *)sender {
  if (sender.dismissToken) { [_dismissed addObject:sender.dismissToken]; [self render]; return; }
  NSString *callId = sender.command[@"callId"];
  if (callId) {
    if ([_pending containsObject:callId]) return;
    [_pending addObject:callId]; _renderedCards = nil; [self endSheet]; [self render];
  }
  [self emit:sender.command];
}
- (CallPanelButton *)button:(NSString *)title symbol:(NSString *)symbol command:(NSDictionary *)command tint:(NSColor *)tint {
  CallPanelButton *button = [CallPanelButton buttonWithTitle:title target:self action:@selector(act:)];
  button.command = command; button.controlSize = NSControlSizeRegular; button.bezelStyle = NSBezelStylePush;
  button.font = [NSFont systemFontOfSize:NSFont.systemFontSize weight:NSFontWeightMedium];
  button.image = symbol ? [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:nil] : nil;
  button.imagePosition = NSImageLeading; button.imageHugsTitle = YES; button.bezelColor = tint;
  if (@available(macOS 26.0, *)) { button.bezelStyle = NSBezelStyleGlass; button.borderShape = NSControlBorderShapeCapsule; button.tintProminence = tint ? NSTintProminencePrimary : NSTintProminenceNone; }
  button.accessibilityLabel = title; button.translatesAutoresizingMaskIntoConstraints = NO;
  [button.heightAnchor constraintEqualToConstant:32].active = YES;
  return button;
}
- (NSStackView *)stack:(NSUserInterfaceLayoutOrientation)orientation spacing:(CGFloat)spacing {
  NSStackView *stack = [[NSStackView alloc] initWithFrame:NSZeroRect];
  stack.orientation = orientation; stack.spacing = spacing; stack.translatesAutoresizingMaskIntoConstraints = NO;
  stack.alignment = orientation == NSUserInterfaceLayoutOrientationVertical ? NSLayoutAttributeLeading : NSLayoutAttributeCenterY;
  return stack;
}
- (NSTextField *)text:(NSString *)text size:(CGFloat)size weight:(NSFontWeight)weight secondary:(BOOL)secondary {
  NSTextField *field = [NSTextField labelWithString:text ?: @""];
  field.font = [NSFont systemFontOfSize:size weight:weight]; field.textColor = secondary ? NSColor.secondaryLabelColor : NSColor.labelColor;
  field.lineBreakMode = NSLineBreakByTruncatingTail; field.translatesAutoresizingMaskIntoConstraints = NO;
  return field;
}
- (NSView *)card:(NSDictionary *)card compact:(BOOL)compact width:(CGFloat)width {
  NSView *root = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, width, compact ? 202 : 252)];
  root.accessibilityElement = YES; root.accessibilityRole = NSAccessibilityGroupRole;
  root.accessibilityLabel = [NSString stringWithFormat:@"Incoming call in %@", card[@"name"]];
  NSStackView *stack = [self stack:NSUserInterfaceLayoutOrientationVertical spacing:12]; [root addSubview:stack];
  [NSLayoutConstraint activateConstraints:@[
    [stack.leadingAnchor constraintEqualToAnchor:root.leadingAnchor constant:24], [stack.trailingAnchor constraintEqualToAnchor:root.trailingAnchor constant:-24],
    [stack.topAnchor constraintEqualToAnchor:root.topAnchor constant:20], [stack.bottomAnchor constraintLessThanOrEqualToAnchor:root.bottomAnchor constant:-20]]];
  NSStackView *header = [self stack:NSUserInterfaceLayoutOrientationHorizontal spacing:7];
  NSImageView *workspaceIcon = [[NSImageView alloc] init]; workspaceIcon.image = [NSImage imageWithSystemSymbolName:@"building.2.crop.circle.fill" accessibilityDescription:nil];
  workspaceIcon.contentTintColor = card[@"accent"] ? hexColor(card[@"accent"]) : color(card[@"color"]); workspaceIcon.translatesAutoresizingMaskIntoConstraints = NO;
  [NSLayoutConstraint activateConstraints:@[[workspaceIcon.widthAnchor constraintEqualToConstant:16], [workspaceIcon.heightAnchor constraintEqualToConstant:16]]];
  [header addArrangedSubview:workspaceIcon];
  NSTextField *workspace = [self text:card[@"name"] size:12 weight:NSFontWeightSemibold secondary:YES]; workspace.toolTip = card[@"name"]; [header addArrangedSubview:workspace];
  [header addArrangedSubview:[[NSView alloc] init]];
  CallPanelButton *dismiss = [self button:@"" symbol:@"xmark" command:nil tint:nil]; dismiss.bordered = NO;
  dismiss.dismissToken = [self token:card]; dismiss.keyEquivalent = @"\e"; [dismiss.widthAnchor constraintEqualToConstant:24].active = YES;
  dismiss.accessibilityLabel = [NSString stringWithFormat:@"Dismiss alert for %@", card[@"name"]]; dismiss.toolTip = @"Hide the alert. The call continues ringing.";
  [header addArrangedSubview:dismiss]; [stack addArrangedSubview:header]; [header.widthAnchor constraintEqualToAnchor:stack.widthAnchor].active = YES;
  NSStackView *identity = [self stack:NSUserInterfaceLayoutOrientationHorizontal spacing:14];
  NSImageView *avatar = [[NSImageView alloc] init]; avatar.image = [NSImage imageWithSystemSymbolName:@"phone.circle.fill" accessibilityDescription:nil];
  avatar.contentTintColor = NSColor.systemGreenColor; avatar.imageScaling = NSImageScaleProportionallyUpOrDown;
  avatar.translatesAutoresizingMaskIntoConstraints = NO; CGFloat avatarSize = compact ? 40 : 52;
  [NSLayoutConstraint activateConstraints:@[[avatar.widthAnchor constraintEqualToConstant:avatarSize], [avatar.heightAnchor constraintEqualToConstant:avatarSize]]];
  [identity addArrangedSubview:avatar];
  NSStackView *name = [self stack:NSUserInterfaceLayoutOrientationVertical spacing:4];
  [name addArrangedSubview:[self text:[card[@"simulation"] boolValue] ? @"Test call · local simulation" : @"Incoming audio call" size:11 weight:NSFontWeightRegular secondary:YES]];
  NSString *title = [card[@"title"] length] ? card[@"title"] : @"Incoming call";
  NSTextField *caller = [self text:title size:compact ? 18 : 22 weight:NSFontWeightSemibold secondary:NO]; caller.toolTip = title; [name addArrangedSubview:caller];
  [identity addArrangedSubview:name]; [stack addArrangedSubview:identity]; [identity.widthAnchor constraintEqualToAnchor:stack.widthAnchor].active = YES;
  [name.widthAnchor constraintEqualToAnchor:identity.widthAnchor constant:-(avatarSize + 14)].active = YES;
  NSString *body = [card[@"busy"] boolValue] ? @"Another call is active. Finish it before answering." : [card[@"body"] length] ? card[@"body"] : @"Answer opens the receiving workspace.";
  body = [body stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if ([body hasPrefix:@"📞"]) body = [[body substringFromIndex:@"📞".length] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
  NSTextField *detail = [self text:body size:12 weight:NSFontWeightRegular secondary:YES]; detail.lineBreakMode = NSLineBreakByWordWrapping; detail.maximumNumberOfLines = 2; detail.toolTip = body;
  [stack addArrangedSubview:detail]; [detail.widthAnchor constraintEqualToAnchor:stack.widthAnchor].active = YES; [detail.heightAnchor constraintGreaterThanOrEqualToConstant:28].active = YES;
  NSString *kind = [card[@"simulation"] boolValue] ? @"test-call-action" : @"call-action";
  NSDictionary *(^command)(NSString *) = ^NSDictionary *(NSString *action) { return @{@"type":kind, @"id":card[@"id"], @"callId":card[@"callId"], @"action":action}; };
  NSStackView *actions = [self stack:NSUserInterfaceLayoutOrientationHorizontal spacing:10]; [actions addArrangedSubview:[[NSView alloc] init]];
  BOOL pending = [_pending containsObject:card[@"callId"]];
  CallPanelButton *previous = dismiss;
  if ([card[@"actions"] containsObject:@"decline"]) {
    CallPanelButton *decline = [self button:@"Decline" symbol:@"phone.down.fill" command:command(@"decline") tint:NSColor.systemRedColor];
    decline.enabled = !pending; decline.accessibilityLabel = [NSString stringWithFormat:@"Decline call in %@", card[@"name"]];
    if (@available(macOS 26.0, *)) decline.tintProminence = NSTintProminenceSecondary;
    previous.nextKeyView = decline; previous = decline;
    [decline.widthAnchor constraintEqualToConstant:104].active = YES; [actions addArrangedSubview:decline];
  }
  BOOL canAnswer = [card[@"actions"] containsObject:@"answer"];
  CallPanelButton *answer = [self button:pending ? @"Working…" : canAnswer ? @"Answer" : @"Open workspace" symbol:canAnswer ? @"phone.fill" : @"arrow.up.forward.app"
    command:canAnswer ? command(@"answer") : @{@"type":@"select", @"id":card[@"id"]} tint:canAnswer ? NSColor.systemGreenColor : NSColor.controlAccentColor];
  answer.enabled = !pending && (!canAnswer || ![card[@"busy"] boolValue]); answer.accessibilityLabel = [NSString stringWithFormat:canAnswer ? @"Answer call in %@" : @"Open %@", card[@"name"]];
  answer.toolTip = canAnswer ? @"Answer in the receiving workspace." : @"Manage this call in Quo.";
  [answer.widthAnchor constraintEqualToConstant:canAnswer ? 104 : 136].active = YES; [actions addArrangedSubview:answer];
  [stack addArrangedSubview:actions]; [actions.widthAnchor constraintEqualToAnchor:stack.widthAnchor].active = YES;
  root.nextKeyView = dismiss; previous.nextKeyView = answer; answer.nextKeyView = dismiss;
  return root;
}
- (void)populate:(IncomingCallPanel *)window cards:(NSArray *)cards compact:(BOOL)compact width:(CGFloat)width height:(CGFloat)height {
  if ([_renderedCards isEqual:cards] && _renderedCompact == compact && _renderedHeight == height) return;
  _renderedCards = [cards copy]; _renderedCompact = compact; _renderedHeight = height; CGFloat rowHeight = compact ? 202 : 252;
  FlippedView *content = [[FlippedView alloc] initWithFrame:NSMakeRect(0, 0, width, rowHeight * cards.count)]; CGFloat y = 0;
  for (NSDictionary *card in cards) { NSView *view = [self card:card compact:compact width:width]; view.frame = NSMakeRect(0, y, width, rowHeight); [content addSubview:view]; y += rowHeight; }
  NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 0, width, height)];
  scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; scroll.drawsBackground = NO; scroll.hasVerticalScroller = rowHeight * cards.count > height; scroll.documentView = content;
  if (!compact) {
    NSView *surface = [[NSView alloc] initWithFrame:scroll.frame];
    [surface addSubview:scroll]; window.contentView = surface;
  } else if (@available(macOS 26.0, *)) {
    NSGlassEffectView *glass = [[NSGlassEffectView alloc] initWithFrame:scroll.frame]; glass.cornerRadius = 20; glass.contentView = scroll; window.contentView = glass;
  } else {
    NSVisualEffectView *surface = [[NSVisualEffectView alloc] initWithFrame:scroll.frame]; surface.material = NSVisualEffectMaterialHUDWindow;
    surface.blendingMode = NSVisualEffectBlendingModeBehindWindow; surface.state = NSVisualEffectStateActive; [surface addSubview:scroll]; window.contentView = surface;
  }
  window.initialFirstResponder = content.subviews.firstObject.nextKeyView;
}
- (IncomingCallPanel *)makeWindow:(BOOL)compact {
  IncomingCallPanel *window = [[IncomingCallPanel alloc] initWithContentRect:NSMakeRect(0, 0, compact ? 360 : 420, compact ? 202 : 252)
    styleMask:compact ? NSWindowStyleMaskNonactivatingPanel : NSWindowStyleMaskTitled | NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
  window.owner = self; window.title = @"Incoming calls — Switchboard"; window.titleVisibility = NSWindowTitleHidden; window.titlebarAppearsTransparent = YES; window.releasedWhenClosed = NO;
  window.becomesKeyOnlyIfNeeded = compact; window.worksWhenModal = YES;
  window.animationBehavior = NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion ? NSWindowAnimationBehaviorNone : NSWindowAnimationBehaviorAlertPanel;
  if (compact) { window.level = NSFloatingWindowLevel; window.floatingPanel = YES; window.hidesOnDeactivate = NO;
    window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
    window.opaque = NO; window.backgroundColor = NSColor.clearColor; window.hasShadow = YES; window.movableByWindowBackground = YES; }
  for (NSWindowButton kind : {NSWindowCloseButton, NSWindowMiniaturizeButton, NSWindowZoomButton}) [window standardWindowButton:kind].hidden = YES;
  return window;
}
- (void)update:(NSDictionary *)model {
  _sheet.appearance = _mainWindow.appearance;
  NSMutableSet *current = [NSMutableSet set], *callIds = [NSMutableSet set];
  for (NSDictionary *card in model[@"cards"]) { [current addObject:[self token:card]]; [callIds addObject:card[@"callId"]]; }
  [_dismissed intersectSet:current]; [_pending intersectSet:callIds];
  if ([_model isEqual:model]) return;
  _model = model; [self render];
}
- (void)render {
  if (_disposed || _rendering) return;
  _rendering = YES; NSMutableArray *cards = [NSMutableArray array];
  NSWindowAnimationBehavior animation = NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion ? NSWindowAnimationBehaviorNone : NSWindowAnimationBehaviorAlertPanel;
  _sheet.animationBehavior = animation; _panel.animationBehavior = animation;
  for (NSDictionary *card in _model[@"cards"]) if (![_dismissed containsObject:[self token:card]]) [cards addObject:card];
  if (![_model[@"unlocked"] boolValue] || !cards.count) { [self endSheet]; [_panel orderOut:nil]; _renderedCards = nil; _rendering = NO; return; }
  BOOL sheet = [self canPresentSheet];
  if (sheet) {
    [_panel orderOut:nil]; if (!_sheet) _sheet = [self makeWindow:NO];
    _sheet.appearance = _mainWindow.appearance;
    CGFloat height = MIN(252 * cards.count, MAX(252, _mainWindow.contentView.bounds.size.height - 112));
    [self populate:_sheet cards:cards compact:NO width:420 height:height]; [_sheet setContentSize:NSMakeSize(420, height)];
    if (!_sheet.sheetParent) {
      __weak CallPanelController *weakSelf = self;
      IncomingCallPanel *presented = _sheet;
      [_mainWindow beginSheet:presented completionHandler:^(NSModalResponse response) {
        [presented orderOut:nil];
        CallPanelController *owner = weakSelf; owner.endingSheet = NO;
        if (!owner || owner.disposed) { [presented close]; owner.sheet = nil; [owner finishDispose]; }
        else [owner render];
      }];
    }
  } else {
    [self endSheet];
    if ([_model[@"enabled"] boolValue]) {
      if (!_panel) _panel = [self makeWindow:YES];
      NSScreen *screen = _mainWindow.screen ?: NSScreen.mainScreen; NSRect available = screen.visibleFrame;
      CGFloat height = MIN(202 * cards.count, MIN(606, available.size.height - 36));
      BOOL retain = _panel.visible && NSIntersectsRect(_panel.frame, available);
      NSRect frame = NSMakeRect(retain ? _panel.frame.origin.x : NSMaxX(available) - 378, retain ? NSMaxY(_panel.frame) - height : NSMaxY(available) - height - 18, 360, height);
      frame.origin.x = MAX(NSMinX(available), MIN(frame.origin.x, NSMaxX(available) - 360));
      frame.origin.y = MAX(NSMinY(available), MIN(frame.origin.y, NSMaxY(available) - height));
      [self populate:_panel cards:cards compact:YES width:360 height:height]; [_panel setFrame:frame display:YES]; [_panel orderFrontRegardless];
    } else { [_panel orderOut:nil]; _renderedCards = nil; }
  }
  _rendering = NO;
}
- (void)dispose {
  if (_disposed) return;
  _disposed = YES; [NSNotificationCenter.defaultCenter removeObserver:self]; [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self];
  [_panel close]; _panel = nil;
  [self endSheet];
  // Electron must not destroy the parent until AppKit finishes its sheet session.
  if (!_endingSheet) { [_sheet close]; _sheet = nil; [self finishDispose]; }
}
- (void)finishDispose {
  [self emit:@{@"type":@"call-panel-disposed"}];
  if (_callback) { napi_release_threadsafe_function(_callback, napi_tsfn_release); _callback = nullptr; }
}
@end
static CallPanelController *callPanelController;
static napi_value callsAttach(napi_env env, napi_callback_info info) {
  size_t count = 2, length = 0; napi_value args[2]; void *bytes = nullptr; napi_get_cb_info(env, info, &count, args, nullptr, nullptr); napi_valuetype type;
  if (count != 2 || napi_get_buffer_info(env, args[0], &bytes, &length) != napi_ok || length != sizeof(void *) || napi_typeof(env, args[1], &type) != napi_ok || type != napi_function || !NSThread.isMainThread) { napi_throw_error(env, nullptr, "Call panels require an NSView handle and callback on the main thread"); return nullptr; }
  [callPanelController dispose]; callPanelController = [[CallPanelController alloc] init]; callPanelController.mainWindow = ((__bridge NSView *)*(void **)bytes).window;
  napi_value resource; napi_create_string_utf8(env, "Switchboard incoming calls", NAPI_AUTO_LENGTH, &resource); napi_threadsafe_function callback;
  if (napi_create_threadsafe_function(env, args[1], nullptr, resource, 64, 1, nullptr, nullptr, nullptr, deliver, &callback) == napi_ok) { napi_unref_threadsafe_function(env, callback); callPanelController.callback = callback; }
  return nullptr;
}
static napi_value callsUpdate(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr); NSString *json = count ? stringArgument(env, arg) : nil;
  NSDictionary *model = json ? [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
  if ([model isKindOfClass:NSDictionary.class]) [callPanelController update:model]; return nullptr;
}
static napi_value callsComplete(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  if (count) { [callPanelController.pending removeObject:stringArgument(env, arg)]; callPanelController.renderedCards = nil; [callPanelController render]; } return nullptr;
}
static napi_value callsOwnsAlerts(napi_env env, napi_callback_info info) { napi_value result; napi_get_boolean(env, [callPanelController ownsAlerts], &result); return result; }
static napi_value callsInspect(napi_env env, napi_callback_info info) {
  BOOL sheet = callPanelController.sheet.sheetParent != nil; NSPanel *panel = sheet ? callPanelController.sheet : callPanelController.panel;
  NSDictionary *state = @{@"visible":@(panel.visible), @"key":@(panel.keyWindow), @"nonactivating":@((panel.styleMask & NSWindowStyleMaskNonactivatingPanel) != 0),
    @"level":@(panel.level), @"cards":callPanelController.model[@"cards"] ?: @[], @"dismissed":@(callPanelController.dismissed.count),
    @"presentation":sheet ? @"sheet" : panel.visible ? @"panel" : @"none", @"sheetVisible":@(sheet && panel.visible),
    @"pending":@(callPanelController.pending.count), @"ownsAlerts":@([callPanelController ownsAlerts])};
  NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:state options:0 error:nil] encoding:NSUTF8StringEncoding];
  napi_value result; napi_create_string_utf8(env, json.UTF8String, NAPI_AUTO_LENGTH, &result); return result;
}
static napi_value callsDispose(napi_env env, napi_callback_info info) { [callPanelController dispose]; return nullptr; }
