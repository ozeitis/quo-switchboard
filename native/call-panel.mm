// A nonactivating panel remains visible when the main window is hidden.
@interface IncomingCallPanel : NSPanel
@end
@implementation IncomingCallPanel
- (BOOL)canBecomeMainWindow { return NO; }
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
@property NSDictionary *model;
@property NSMutableSet<NSString *> *dismissed;
@property napi_threadsafe_function callback;
- (void)update:(NSDictionary *)model;
- (void)render;
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
- (void)render {
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
  CGFloat rowHeight = 164, height = MIN(600, rowHeight * cards.count + 12);
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
    NSTextField *workspace = label(card[@"name"], NSMakeRect(56, y + 8, 263, 19), 13); workspace.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold]; [content addSubview:workspace];
    NSTextField *heading = label([card[@"title"] length] ? card[@"title"] : @"Incoming call", NSMakeRect(20, y + 44, 320, 22), 17);
    heading.font = [NSFont systemFontOfSize:17 weight:NSFontWeightSemibold]; [content addSubview:heading];
    NSTextField *detail = label([card[@"body"] length] ? card[@"body"] : @"Answer opens this workspace.", NSMakeRect(20, y + 70, 320, 18), 12); detail.textColor = NSColor.secondaryLabelColor; [content addSubview:detail];
    CallPanelButton *dismiss = [self button:@"" symbol:@"xmark" command:nil frame:NSMakeRect(326, y + 5, 24, 24) parent:content];
    dismiss.bezelStyle = NSBezelStyleToolbar; dismiss.showsBorderOnlyWhileMouseInside = YES; dismiss.dismissToken = [self token:card];
    dismiss.accessibilityLabel = [NSString stringWithFormat:@"Dismiss alert for %@", card[@"name"]]; dismiss.toolTip = @"Dismiss this alert. The call continues ringing.";
    NSArray *actions = card[@"actions"] ?: @[];
    if ([actions containsObject:@"answer"]) {
      CallPanelButton *answer = [self button:@"Answer" symbol:@"phone.fill" command:command(@"answer") frame:NSMakeRect(180, y + 101, 158, 32) parent:content];
      answer.bezelColor = NSColor.systemGreenColor; answer.contentTintColor = NSColor.systemGreenColor; answer.enabled = ![card[@"busy"] boolValue];
      answer.accessibilityLabel = [NSString stringWithFormat:@"Answer call in %@", card[@"name"]];
      answer.toolTip = answer.enabled ? @"Answer in the originating workspace" : @"Finish the active call before answering another.";
    } else {
      CallPanelButton *open = [self button:@"Open workspace" symbol:@"arrow.up.forward.app" command:@{@"type":@"select", @"id":identifier} frame:NSMakeRect(180, y + 101, 158, 32) parent:content];
      open.accessibilityLabel = [NSString stringWithFormat:@"Open %@", card[@"name"]];
    }
    if ([actions containsObject:@"decline"]) {
      CallPanelButton *decline = [self button:@"Decline" symbol:@"phone.down.fill" command:command(@"decline") frame:NSMakeRect(20, y + 101, 148, 32) parent:content]; decline.contentTintColor = NSColor.systemRedColor;
      decline.accessibilityLabel = [NSString stringWithFormat:@"Decline call in %@", card[@"name"]];
    }
    if ([card[@"busy"] boolValue]) { NSTextField *busy = label(@"Another call is active. Answer is paused.", NSMakeRect(20, y + 140, 320, 16), 11); busy.textColor = NSColor.secondaryLabelColor; [content addSubview:busy]; }
    y += rowHeight;
  }
  scroll.documentView = content; [surface addSubview:scroll];
  [_panel orderFrontRegardless];
}
- (void)dispose {
  [NSNotificationCenter.defaultCenter removeObserver:self]; [_panel close]; _panel = nil;
  if (_callback) { napi_release_threadsafe_function(_callback, napi_tsfn_abort); _callback = nullptr; }
}
@end

static CallPanelController *callPanelController;
static napi_value callsAttach(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr); napi_valuetype type;
  if (!count || napi_typeof(env, arg, &type) != napi_ok || type != napi_function || !NSThread.isMainThread) { napi_throw_error(env, nullptr, "Call panels require a callback on the main thread"); return nullptr; }
  [callPanelController dispose]; callPanelController = [[CallPanelController alloc] init];
  napi_value resource; napi_create_string_utf8(env, "Switchboard incoming calls", NAPI_AUTO_LENGTH, &resource);
  napi_threadsafe_function callback;
  if (napi_create_threadsafe_function(env, arg, nullptr, resource, 64, 1, nullptr, nullptr, nullptr, deliver, &callback) == napi_ok) { napi_unref_threadsafe_function(env, callback); callPanelController.callback = callback; }
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
    @"level":@(panel.level), @"cards":callPanelController.model[@"cards"] ?: @[], @"dismissed":@(callPanelController.dismissed.count)};
  NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:state options:0 error:nil] encoding:NSUTF8StringEncoding];
  napi_value result; napi_create_string_utf8(env, json.UTF8String, NAPI_AUTO_LENGTH, &result); return result;
}
static napi_value callsDispose(napi_env env, napi_callback_info info) { [callPanelController dispose]; callPanelController = nil; return nullptr; }
