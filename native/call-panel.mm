// A nonactivating panel remains visible when the main window is hidden.
#include <cmath>
@interface IncomingCallPanel : NSPanel
@end
@implementation IncomingCallPanel
- (BOOL)canBecomeMainWindow { return NO; }
- (BOOL)canBecomeKeyWindow { return NO; }
@end

@interface CallPanelButton : NSButton
@property NSDictionary *command;
@property NSString *dismissToken;
@property NSColor *semanticColor;
@end
@implementation CallPanelButton
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (BOOL)needsPanelToBecomeKey { return NO; }
- (void)drawRect:(NSRect)dirtyRect {
  if (!_semanticColor) { [super drawRect:dirtyRect]; return; }
  NSColor *background = [_semanticColor colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
  // Preserve semantic system hues, with at least 4.5:1 against white text.
  CGFloat r = background.redComponent, g = background.greenComponent, b = background.blueComponent;
  auto linear = [](CGFloat value) { return value <= 0.04045 ? value / 12.92 : std::pow((value + 0.055) / 1.055, 2.4); };
  while (0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) > 0.1833) { r *= 0.95; g *= 0.95; b *= 0.95; }
  background = [NSColor colorWithSRGBRed:r green:g blue:b alpha:1];
  if (!self.enabled) background = NSColor.quaternaryLabelColor;
  else if (self.highlighted) background = [background blendedColorWithFraction:0.12 ofColor:NSColor.blackColor];
  [background setFill];
  [[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(self.bounds, 1, 1) xRadius:14 yRadius:14] fill];
  NSColor *foreground = self.enabled ? NSColor.whiteColor : NSColor.secondaryLabelColor;
  NSDictionary *attributes = @{NSFontAttributeName:self.font, NSForegroundColorAttributeName:foreground};
  NSSize size = [self.title sizeWithAttributes:attributes];
  CGFloat total = size.width + (self.image ? 23 : 0), x = (self.bounds.size.width - total) / 2;
  if (self.image) {
    NSImage *image = [self.image imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPaletteColors:@[foreground]]];
    [image drawInRect:NSMakeRect(x, (self.bounds.size.height - 15) / 2, 15, 15) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
    x += 23;
  }
  [self.title drawAtPoint:NSMakePoint(x, (self.bounds.size.height - size.height) / 2) withAttributes:attributes];
  if (self.window.firstResponder == self) { NSSetFocusRingStyle(NSFocusRingOnly); [[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(self.bounds, 1, 1) xRadius:14 yRadius:14] fill]; }
}
@end

@interface CallPanelController : NSObject
@property IncomingCallPanel *panel;
@property (weak) NSWindow *mainWindow;
@property FlippedView *shelf;
@property NSDictionary *model;
@property NSMutableSet<NSString *> *dismissed;
@property napi_threadsafe_function callback;
- (void)update:(NSDictionary *)model;
- (void)render;
- (void)renderShelf;
- (void)dispose;
@end

@implementation CallPanelController
- (instancetype)init {
  if ((self = [super init])) {
    _dismissed = [NSMutableSet set];
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(screenChanged:) name:NSApplicationDidChangeScreenParametersNotification object:nil];
  }
  return self;
}
- (NSString *)token:(NSDictionary *)card { return [NSString stringWithFormat:@"%@:%@", card[@"id"], card[@"callId"]]; }
- (void)emit:(NSDictionary *)command {
  NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:command options:0 error:nil] encoding:NSUTF8StringEncoding];
  if (_callback && json) {
    auto *message = new std::string(json.UTF8String);
    if (napi_call_threadsafe_function(_callback, message, napi_tsfn_nonblocking) != napi_ok) delete message;
  }
}
- (void)act:(CallPanelButton *)sender {
  if (sender.dismissToken) { [_dismissed addObject:sender.dismissToken]; [self render]; }
  else [self emit:sender.command];
}
- (CallPanelButton *)button:(NSString *)title symbol:(NSString *)symbol command:(NSDictionary *)command frame:(NSRect)frame parent:(NSView *)parent {
  CallPanelButton *button = [[CallPanelButton alloc] initWithFrame:frame];
  button.title = title; button.command = command; button.target = self; button.action = @selector(act:);
  button.bezelStyle = NSBezelStylePush; button.controlSize = NSControlSizeRegular;
  if (@available(macOS 26.0, *)) button.bezelStyle = NSBezelStyleGlass;
  button.font = [NSFont systemFontOfSize:13 weight:NSFontWeightMedium];
  button.focusRingType = NSFocusRingTypeExterior;
  button.image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:nil];
  button.imagePosition = title.length ? NSImageLeading : NSImageOnly;
  button.symbolConfiguration = [NSImageSymbolConfiguration configurationWithPointSize:13 weight:NSFontWeightMedium];
  button.accessibilityLabel = title; [parent addSubview:button]; return button;
}
- (void)update:(NSDictionary *)model {
  NSMutableSet *current = [NSMutableSet set];
  for (NSDictionary *card in model[@"cards"]) [current addObject:[self token:card]];
  [_dismissed intersectSet:current];
  if ([_model isEqual:model]) return;
  _model = model; [self render];
}
- (void)screenChanged:(NSNotification *)notification { [self render]; }
- (void)renderShelf {
  NSView *host = _mainWindow.contentView;
  if (!host) return;
  if (!_shelf) {
    _shelf = [[FlippedView alloc] initWithFrame:NSZeroRect];
    _shelf.accessibilityElement = YES; _shelf.accessibilityRole = NSAccessibilityGroupRole; _shelf.accessibilityLabel = @"Incoming calls";
    _shelf.accessibilityParent = _mainWindow;
    _mainWindow.accessibilityChildren = [(_mainWindow.accessibilityChildren ?: @[]) arrayByAddingObject:_shelf];
  }
  CGFloat height = [_model[@"shelfHeight"] doubleValue], inset = [_model[@"sidebarWidth"] doubleValue];
  CGFloat width = MAX(0, [_model[@"width"] doubleValue] - inset), row = [_model[@"rowHeight"] doubleValue];
  _shelf.frame = NSMakeRect(inset, [_model[@"height"] doubleValue] - [_model[@"toolbarHeight"] doubleValue] - height, width, height);
  _shelf.hidden = ![_model[@"shelfEnabled"] boolValue] || height <= 0;
  [_shelf.subviews makeObjectsPerformSelector:@selector(removeFromSuperview)];
  [host addSubview:_shelf positioned:NSWindowAbove relativeTo:nil];
  if (_shelf.hidden) return;
  NSArray *cards = _model[@"cards"];
  NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:_shelf.bounds]; scroll.drawsBackground = NO; scroll.hasVerticalScroller = cards.count * row > height;
  FlippedView *content = [[FlippedView alloc] initWithFrame:NSMakeRect(0, 0, width, cards.count * row)];
  CGFloat y = 0;
  for (NSDictionary *card in cards) {
    NSString *kind = [card[@"simulation"] boolValue] ? @"test-call-action" : @"call-action";
    NSDictionary *(^command)(NSString *) = ^NSDictionary *(NSString *action) { return @{@"type":kind, @"id":card[@"id"], @"callId":card[@"callId"], @"action":action}; };
    NSImageView *icon = [[NSImageView alloc] initWithFrame:NSMakeRect(16, y + 18, 24, 24)]; icon.image = [NSImage imageWithSystemSymbolName:@"phone.badge.waveform.fill" accessibilityDescription:@"Incoming call"];
    icon.contentTintColor = card[@"accent"] ? hexColor(card[@"accent"]) : color(card[@"color"]); [content addSubview:icon];
    NSString *title = [NSString stringWithFormat:@"%@ · %@", card[@"name"], [card[@"title"] length] ? card[@"title"] : @"Incoming call"];
    NSTextField *heading = label(title, NSMakeRect(52, y + 12, MAX(80, width - 292), 18), 13); heading.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold]; heading.toolTip = title; [content addSubview:heading];
    NSString *body = [card[@"busy"] boolValue] ? @"Finish the active call before answering." : [card[@"body"] length] ? card[@"body"] : @"Answer opens the receiving workspace.";
    NSTextField *detail = label(body, NSMakeRect(52, y + 32, MAX(80, width - 292), 16), 11); detail.textColor = NSColor.secondaryLabelColor; detail.toolTip = body; [content addSubview:detail];
    NSArray *actions = card[@"actions"] ?: @[];
    BOOL canAnswer = [actions containsObject:@"answer"];
    CallPanelButton *answer = [self button:canAnswer ? @"Answer" : @"Open" symbol:canAnswer ? @"phone.fill" : @"arrow.up.forward.app" command:canAnswer ? command(@"answer") : @{@"type":@"select", @"id":card[@"id"]} frame:NSMakeRect(width - 112, y + 13, 96, 34) parent:content];
    answer.semanticColor = canAnswer ? NSColor.systemGreenColor : NSColor.systemBlueColor; answer.enabled = !canAnswer || ![card[@"busy"] boolValue]; answer.accessibilityLabel = [NSString stringWithFormat:canAnswer ? @"Answer call in %@" : @"Open %@", card[@"name"]];
    if ([actions containsObject:@"decline"]) {
      CallPanelButton *decline = [self button:@"Decline" symbol:@"phone.down.fill" command:command(@"decline") frame:NSMakeRect(width - 216, y + 13, 96, 34) parent:content]; decline.semanticColor = NSColor.systemRedColor; decline.accessibilityLabel = [NSString stringWithFormat:@"Decline call in %@", card[@"name"]];
    }
    y += row;
  }
  scroll.documentView = content; [_shelf addSubview:scroll];
}
- (void)render {
  [self renderShelf];
  NSMutableArray *cards = [NSMutableArray array];
  for (NSDictionary *card in _model[@"cards"]) if (![_dismissed containsObject:[self token:card]]) [cards addObject:card];
  if (![_model[@"enabled"] boolValue] || !cards.count) { [_panel orderOut:nil]; return; }
  if (!_panel) {
    _panel = [[IncomingCallPanel alloc] initWithContentRect:NSMakeRect(0, 0, 360, 170)
      styleMask:NSWindowStyleMaskNonactivatingPanel
      backing:NSBackingStoreBuffered defer:NO];
    _panel.title = @"Incoming calls — Switchboard"; _panel.titleVisibility = NSWindowTitleHidden; _panel.titlebarAppearsTransparent = YES;
    _panel.level = NSFloatingWindowLevel; _panel.floatingPanel = YES; _panel.hidesOnDeactivate = NO;
    _panel.becomesKeyOnlyIfNeeded = YES; _panel.worksWhenModal = YES; _panel.releasedWhenClosed = NO;
    _panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
    _panel.opaque = NO; _panel.backgroundColor = NSColor.clearColor; _panel.hasShadow = YES; _panel.movableByWindowBackground = YES;
    _panel.animationBehavior = NSWindowAnimationBehaviorNone;
    for (NSWindowButton kind : {NSWindowCloseButton, NSWindowMiniaturizeButton, NSWindowZoomButton}) [_panel standardWindowButton:kind].hidden = YES;
  }
  CGFloat rowHeight = 176, height = MIN(600, rowHeight * cards.count + 12);
  NSScreen *screen = NSApp.mainWindow.screen ?: NSScreen.mainScreen;
  NSRect available = screen.visibleFrame;
  height = MIN(height, MAX(100, available.size.height - 36));
  BOOL retainedPosition = _panel.visible && NSIntersectsRect(_panel.frame, available);
  NSRect frame = NSMakeRect(retainedPosition ? _panel.frame.origin.x : NSMaxX(available) - 378,
    retainedPosition ? NSMaxY(_panel.frame) - height : NSMaxY(available) - height - 18, 360, height);
  frame.origin.x = MAX(NSMinX(available), MIN(frame.origin.x, NSMaxX(available) - frame.size.width));
  frame.origin.y = MAX(NSMinY(available), MIN(frame.origin.y, NSMaxY(available) - frame.size.height));
  [_panel setFrame:frame display:YES];
  NSView *surface = [[FlippedView alloc] initWithFrame:NSMakeRect(0, 0, 360, height)];
  if (@available(macOS 26.0, *)) {
    NSGlassEffectView *glass = [[NSGlassEffectView alloc] initWithFrame:surface.bounds]; glass.cornerRadius = 20; glass.contentView = surface; _panel.contentView = glass;
  } else {
    NSVisualEffectView *effect = [[NSVisualEffectView alloc] initWithFrame:surface.bounds]; effect.material = NSVisualEffectMaterialHUDWindow;
    effect.blendingMode = NSVisualEffectBlendingModeBehindWindow; effect.state = NSVisualEffectStateActive;
    effect.wantsLayer = YES; effect.layer.cornerRadius = 18; effect.layer.masksToBounds = YES; [effect addSubview:surface]; _panel.contentView = effect;
  }
  NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:surface.bounds]; scroll.drawsBackground = NO;
  scroll.hasVerticalScroller = rowHeight * cards.count + 12 > height;
  FlippedView *content = [[FlippedView alloc] initWithFrame:NSMakeRect(0, 0, 360, rowHeight * cards.count + 12)];
  CGFloat y = 8;
  for (NSDictionary *card in cards) {
    NSString *identifier = card[@"id"], *callId = card[@"callId"];
    NSString *kind = [card[@"simulation"] boolValue] ? @"test-call-action" : @"call-action";
    NSDictionary *(^command)(NSString *) = ^NSDictionary *(NSString *action) { return @{@"type":kind, @"id":identifier, @"callId":callId, @"action":action}; };
    NSImageView *icon = [[NSImageView alloc] initWithFrame:NSMakeRect(20, y + 8, 26, 26)];
    icon.image = [NSImage imageWithSystemSymbolName:@"phone.badge.waveform.fill" accessibilityDescription:@"Incoming call"];
    icon.contentTintColor = card[@"accent"] ? hexColor(card[@"accent"]) : color(card[@"color"]); [content addSubview:icon];
    icon.wantsLayer = YES; icon.layer.cornerRadius = 8; icon.layer.backgroundColor = [icon.contentTintColor colorWithAlphaComponent:0.12].CGColor;
    NSTextField *workspace = label(card[@"name"], NSMakeRect(56, y + 8, 263, 19), 13); workspace.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold]; [content addSubview:workspace];
    NSTextField *heading = label([card[@"title"] length] ? card[@"title"] : @"Incoming call", NSMakeRect(20, y + 44, 320, 22), 17);
    heading.font = [NSFont systemFontOfSize:17 weight:NSFontWeightSemibold]; [content addSubview:heading];
    NSTextField *detail = label([card[@"body"] length] ? card[@"body"] : @"Answer opens this workspace.", NSMakeRect(20, y + 70, 320, 18), 12); detail.textColor = NSColor.secondaryLabelColor; [content addSubview:detail];
    CallPanelButton *dismiss = [self button:@"" symbol:@"xmark" command:nil frame:NSMakeRect(326, y + 5, 24, 24) parent:content];
    dismiss.bezelStyle = NSBezelStyleToolbar; dismiss.showsBorderOnlyWhileMouseInside = YES; dismiss.dismissToken = [self token:card];
    dismiss.accessibilityLabel = [NSString stringWithFormat:@"Dismiss alert for %@", card[@"name"]]; dismiss.toolTip = @"Dismiss this alert. The call continues ringing.";
    NSArray *actions = card[@"actions"] ?: @[];
    if ([actions containsObject:@"answer"]) {
      CallPanelButton *answer = [self button:@"Answer" symbol:@"phone.fill" command:command(@"answer") frame:NSMakeRect(180, y + 101, 158, 40) parent:content];
      answer.semanticColor = NSColor.systemGreenColor; answer.enabled = ![card[@"busy"] boolValue];
      answer.accessibilityLabel = [NSString stringWithFormat:@"Answer call in %@", card[@"name"]];
      answer.toolTip = answer.enabled ? @"Answer in the originating workspace" : @"Finish the active call before answering another.";
    } else {
      CallPanelButton *open = [self button:@"Open workspace" symbol:@"arrow.up.forward.app" command:@{@"type":@"select", @"id":identifier} frame:NSMakeRect(180, y + 101, 158, 40) parent:content];
      open.semanticColor = NSColor.systemBlueColor;
      open.accessibilityLabel = [NSString stringWithFormat:@"Open %@", card[@"name"]];
    }
    if ([actions containsObject:@"decline"]) {
      CallPanelButton *decline = [self button:@"Decline" symbol:@"phone.down.fill" command:command(@"decline") frame:NSMakeRect(20, y + 101, 148, 40) parent:content]; decline.semanticColor = NSColor.systemRedColor;
      decline.accessibilityLabel = [NSString stringWithFormat:@"Decline call in %@", card[@"name"]];
    }
    if ([card[@"busy"] boolValue]) { NSTextField *busy = label(@"Another call is active. Answer is paused.", NSMakeRect(20, y + 148, 320, 16), 11); busy.textColor = NSColor.secondaryLabelColor; [content addSubview:busy]; }
    y += rowHeight;
  }
  scroll.documentView = content; [surface addSubview:scroll];
  [_panel orderFrontRegardless];
}
- (void)dispose {
  [NSNotificationCenter.defaultCenter removeObserver:self]; [_panel close]; _panel = nil;
  if (_shelf) { NSMutableArray *children = [_mainWindow.accessibilityChildren mutableCopy]; [children removeObject:_shelf]; _mainWindow.accessibilityChildren = children; [_shelf removeFromSuperview]; _shelf = nil; }
  if (_callback) { napi_release_threadsafe_function(_callback, napi_tsfn_abort); _callback = nullptr; }
}
@end

static CallPanelController *callPanelController;
static napi_value callsAttach(napi_env env, napi_callback_info info) {
  size_t count = 2, length = 0; napi_value args[2]; void *bytes = nullptr; napi_get_cb_info(env, info, &count, args, nullptr, nullptr); napi_valuetype type;
  if (count != 2 || napi_get_buffer_info(env, args[0], &bytes, &length) != napi_ok || length != sizeof(void *) || napi_typeof(env, args[1], &type) != napi_ok || type != napi_function || !NSThread.isMainThread) { napi_throw_error(env, nullptr, "Call panels require an NSView handle and callback on the main thread"); return nullptr; }
  [callPanelController dispose]; callPanelController = [[CallPanelController alloc] init];
  callPanelController.mainWindow = ((__bridge NSView *)*(void **)bytes).window;
  napi_value resource; napi_create_string_utf8(env, "Switchboard incoming calls", NAPI_AUTO_LENGTH, &resource);
  napi_threadsafe_function callback;
  if (napi_create_threadsafe_function(env, args[1], nullptr, resource, 64, 1, nullptr, nullptr, nullptr, deliver, &callback) == napi_ok) { napi_unref_threadsafe_function(env, callback); callPanelController.callback = callback; }
  return nullptr;
}
static napi_value callsUpdate(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  NSString *json = count ? stringArgument(env, arg) : nil;
  NSDictionary *model = json ? [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
  if ([model isKindOfClass:NSDictionary.class]) [callPanelController update:model]; return nullptr;
}
static napi_value callsInspect(napi_env env, napi_callback_info info) {
  NSPanel *panel = callPanelController.panel;
  NSDictionary *state = @{@"visible":@(panel.visible), @"key":@(panel.keyWindow), @"nonactivating":@((panel.styleMask & NSWindowStyleMaskNonactivatingPanel) != 0),
    @"level":@(panel.level), @"cards":callPanelController.model[@"cards"] ?: @[], @"dismissed":@(callPanelController.dismissed.count),
    @"shelfVisible":@(callPanelController.mainWindow.visible && callPanelController.shelf && !callPanelController.shelf.hidden), @"shelfHeight":@(callPanelController.shelf.frame.size.height)};
  NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:state options:0 error:nil] encoding:NSUTF8StringEncoding];
  napi_value result; napi_create_string_utf8(env, json.UTF8String, NAPI_AUTO_LENGTH, &result); return result;
}
static napi_value callsDispose(napi_env env, napi_callback_info info) { [callPanelController dispose]; callPanelController = nil; return nullptr; }
