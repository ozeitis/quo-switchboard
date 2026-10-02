// Included in the AppKit module. No website content is executed by this surface.
@interface ActivityAction : NSButton
@property NSDictionary *command;
@end
@implementation ActivityAction
@end

@interface ActivityController : NSObject <NSPopoverDelegate, NSStatusItemExpandedInterfaceDelegate>
@property NSMutableDictionary<NSString *, NSStatusItem *> *items;
@property NSDictionary *model;
@property NSPopover *popover;
@property NSStatusItem *openItem;
@property napi_threadsafe_function callback;
@property NSInteger frame;
@property NSString *contentKey;
- (void)update:(NSDictionary *)model;
- (void)draw;
- (void)show;
- (void)dispose;
@end
@implementation ActivityController
- (instancetype)init { if ((self = [super init])) _items = [NSMutableDictionary dictionary]; return self; }
- (void)emit:(NSDictionary *)command {
  NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:command options:0 error:nil] encoding:NSUTF8StringEncoding];
  if (_callback && json) { auto *message = new std::string(json.UTF8String); if (napi_call_threadsafe_function(_callback, message, napi_tsfn_nonblocking) != napi_ok) delete message; }
}
- (void)close {
  NSStatusItem *item = _openItem; _openItem = nil; [_popover close];
  if (@available(macOS 27.0, *)) [item.expandedInterfaceSession cancel];
}
- (void)popoverDidClose:(NSNotification *)notification { [self close]; }
- (void)act:(ActivityAction *)sender {
  NSDictionary *command = sender.command;
  if (![command[@"type"] isEqual:@"test-call-action"]) [self close];
  [self emit:command];
}
- (ActivityAction *)action:(NSString *)title command:(NSDictionary *)command frame:(NSRect)frame parent:(NSView *)parent {
  ActivityAction *button = [[ActivityAction alloc] initWithFrame:frame]; button.title = title; button.command = command;
  button.target = self; button.action = @selector(act:); button.bezelStyle = NSBezelStyleRounded; button.controlSize = NSControlSizeSmall;
  button.font = [NSFont systemFontOfSize:12]; button.accessibilityLabel = title; [parent addSubview:button]; return button;
}
- (void)update:(NSDictionary *)model {
  _model = model;
  NSArray *descriptors = model[@"items"] ?: @[];
  NSMutableSet *desired = [NSMutableSet set]; for (NSDictionary *descriptor in descriptors) [desired addObject:descriptor[@"id"]];
  for (NSString *identifier in _items.allKeys) if (![desired containsObject:identifier]) { if (_openItem == _items[identifier]) [self close]; [NSStatusBar.systemStatusBar removeStatusItem:_items[identifier]]; [_items removeObjectForKey:identifier]; }
  for (NSDictionary *descriptor in descriptors) {
    NSString *identifier = descriptor[@"id"]; NSStatusItem *item = _items[identifier];
    if (!item) {
      item = [NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength]; item.autosaveName = [@"Switchboard." stringByAppendingString:identifier];
      item.button.target = self; item.button.action = @selector(clicked:); item.button.identifier = identifier;
      if (@available(macOS 27.0, *)) item.expandedInterfaceDelegate = self;
      _items[identifier] = item;
    }
    item.button.title = descriptor[@"title"] ?: @"";
    item.button.font = [NSFont monospacedDigitSystemFontOfSize:12 weight:NSFontWeightRegular];
    item.button.imagePosition = NSImageLeading; item.button.imageScaling = NSImageScaleNone;
    item.button.toolTip = descriptor[@"tooltip"]; item.button.accessibilityLabel = [NSString stringWithFormat:@"%@ activity", descriptor[@"name"]];
  }
  [self draw]; if (_popover.shown) [self content];
}
- (void)draw {
  for (NSDictionary *descriptor in _model[@"items"]) {
    NSDictionary *source = descriptor[@"source"], *call = source;
    if (!call) for (NSDictionary *account in _model[@"accounts"]) if ([account[@"ringing"] boolValue]) { call = account; break; }
    if (!call) for (NSDictionary *account in _model[@"accounts"]) if ([account[@"inCall"] boolValue]) { call = account; break; }
    NSString *phase = [call[@"ringing"] boolValue] ? @"ringing" : [call[@"inCall"] boolValue] ? call[@"callPhase"] : @"idle";
    if (_model[@"testCall"] && (!source || [source[@"id"] isEqual:_model[@"testCall"][@"workspaceId"]])) phase = _model[@"testCall"][@"phase"];
    NSImage *image = [NSImage imageWithSystemSymbolName:[phase isEqual:@"idle"] ? @"phone.bubble" : callSymbol(phase) accessibilityDescription:nil];
    image = [image imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:15 weight:NSFontWeightRegular]];
    if (![phase isEqual:@"idle"]) {
      NSColor *tint = callColor(phase); if ([phase isEqual:@"ringing"] && _frame) tint = [tint colorWithAlphaComponent:.55];
      image = [image imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPaletteColors:@[tint]]]; [image setTemplate:NO];
    } else {
      NSUInteger total = source ? [source[@"unread"] integerValue] : 0;
      if (!source) for (NSDictionary *account in _model[@"accounts"]) total += [account[@"unread"] integerValue];
      if (total) {
        NSImage *badge = [[NSImage alloc] initWithSize:NSMakeSize(18, 18)]; [badge lockFocus];
        [image drawInRect:NSMakeRect(0, 0, 15, 15)]; [NSColor.blackColor setFill]; [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(14, 14, 3, 3)] fill];
        [badge unlockFocus]; image = badge;
      }
      [image setTemplate:YES];
    }
    NSStatusBarButton *button = _items[descriptor[@"id"]].button;
    button.image = image;
    // Optional separate items use native text, not low-contrast painted avatars.
    if (source) {
      NSString *name = source[@"name"]; NSString *initial = [[name substringWithRange:[name rangeOfComposedCharacterSequenceAtIndex:0]] uppercaseString];
      button.title = [NSString stringWithFormat:@"%@%@%@", initial, [descriptor[@"title"] length] ? @" " : @"", descriptor[@"title"] ?: @""];
    }
  }
}
- (void)clicked:(NSStatusBarButton *)button {
  if (@available(macOS 27.0, *)) return;
  NSStatusItem *item = _items[button.identifier]; if (_popover.shown && _openItem == item) [self close]; else [self open:item];
}
- (void)statusItem:(NSStatusItem *)item didBeginExpandedInterfaceSession:(NSStatusItemExpandedInterfaceSession *)session API_AVAILABLE(macos(27.0)) { [self open:item]; }
- (void)statusItemDidEndExpandedInterfaceSession:(NSStatusItem *)item animated:(BOOL)animated { if (_openItem == item) { _openItem = nil; [_popover close]; } }
- (void)open:(NSStatusItem *)item {
  if (!item.button.window) return;
  if (_openItem && _openItem != item) [self close]; _openItem = item;
  if (!_popover) { _popover = [[NSPopover alloc] init]; _popover.behavior = NSPopoverBehaviorTransient; _popover.delegate = self; _popover.contentViewController = [[NSViewController alloc] init]; }
  _popover.animates = ![_model[@"reduceMotion"] boolValue]; _contentKey = nil; [self content];
  [_popover showRelativeToRect:item.button.bounds ofView:item.button preferredEdge:NSRectEdgeMinY];
  _popover.contentViewController.view.window.title = @"Switchboard activity";
  _popover.contentViewController.view.window.autorecalculatesKeyViewLoop = YES;
  [_popover.contentViewController.view.window makeKeyWindow];
}
- (void)show { NSStatusItem *item = _items[@"combined"] ?: _items.allValues.firstObject; if (item) [self open:item]; }
- (void)content {
  NSString *key = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:@{ @"accounts":_model[@"accounts"] ?: @[], @"activity":_model[@"activity"] ?: @[], @"testCall":_model[@"testCall"] ?: @{}, @"activeId":_model[@"activeId"] ?: @"" } options:0 error:nil] encoding:NSUTF8StringEncoding];
  if ([_contentKey isEqual:key]) return; _contentKey = key;
  NSArray *accounts = [(_model[@"accounts"] ?: @[]) sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) { NSInteger first = [a[@"ringing"] boolValue] ? 2 : [a[@"inCall"] boolValue] ? 1 : 0; NSInteger second = [b[@"ringing"] boolValue] ? 2 : [b[@"inCall"] boolValue] ? 1 : 0; return first > second ? NSOrderedAscending : first < second ? NSOrderedDescending : NSOrderedSame; }], *recent = _model[@"activity"] ?: @[];
  NSUInteger rows = accounts.count, history = MIN(recent.count, 4);
  CGFloat rowHeight = 0; for (NSDictionary *account in accounts) rowHeight += [account[@"callActions"] count] ? 80 : 60;
  CGFloat height = 128 + rowHeight + (history ? 30 + history * 50 : 40) + (_model[@"testCall"] ? 108 : 0);
  NSView *view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 360, height)];
  [view addSubview:label(@"Switchboard", NSMakeRect(20, height - 38, 250, 22), 16)];
  NSUInteger unread = 0; BOOL partial = NO; for (NSDictionary *account in accounts) { unread += [account[@"unread"] integerValue]; if (![account[@"unreadKnown"] boolValue]) partial = YES; }
  NSTextField *summary = label(unread || !partial ? [NSString stringWithFormat:@"%lu%@ unread across %lu workspace%@", unread, partial ? @"+" : @"", rows, rows == 1 ? @"" : @"s"] : @"Unread counts unavailable", NSMakeRect(20, height - 58, 325, 16), 11); summary.textColor = NSColor.secondaryLabelColor; [view addSubview:summary];
  CGFloat y = height - 72;
  for (NSDictionary *account in accounts) {
    y -= [account[@"callActions"] count] ? 80 : 60; NSString *identifier = account[@"id"];
    WorkspaceAvatar *avatar = [[WorkspaceAvatar alloc] initWithFrame:NSMakeRect(20, y + 39, 28, 28)]; avatar.account = account; [view addSubview:avatar];
    ActivityAction *open = [self action:account[@"name"] command:@{@"type":@"select", @"id":identifier} frame:NSMakeRect(55, y + 39, 190, 28) parent:view]; open.bezelStyle = NSBezelStyleToolbar; open.showsBorderOnlyWhileMouseInside = YES; open.alignment = NSTextAlignmentLeft; open.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold]; if ([identifier isEqual:_model[@"activeId"]]) { open.image = [NSImage imageWithSystemSymbolName:@"checkmark" accessibilityDescription:nil]; open.imagePosition = NSImageTrailing; open.symbolConfiguration = [NSImageSymbolConfiguration configurationWithPointSize:10 weight:NSFontWeightMedium]; }
    NSTextField *count = label([account[@"unreadKnown"] boolValue] || [account[@"unread"] integerValue] ? [NSString stringWithFormat:@"%@%@", account[@"unread"], [account[@"unreadKnown"] boolValue] ? @"" : @"+"] : @"—", NSMakeRect(263, y + 43, 74, 20), 13); count.alignment = NSTextAlignmentRight; [view addSubview:count];
    NSTextField *detail = label([account[@"callDescription"] length] ? account[@"callDescription"] : [account[@"status"] isEqual:@"ready"] ? @"No active call" : account[@"detail"], NSMakeRect(55, y + 21, 280, 16), 11); detail.textColor = NSColor.secondaryLabelColor; [view addSubview:detail];
    CGFloat x = 52;
    NSArray *actions = account[@"callActions"] ?: @[];
    for (NSString *action in actions) {
      CGFloat width = [action isEqual:@"decline"] ? 62 : 56;
      ActivityAction *control = [self action:action.capitalizedString command:@{@"type":@"call-action", @"id":identifier, @"callId":account[@"callId"] ?: @"", @"action":action} frame:NSMakeRect(x, y - 3, width, 25) parent:view];
      if ([action isEqual:@"answer"]) for (NSDictionary *other in accounts) if ([other[@"inCall"] boolValue]) control.enabled = NO;
      if ([action isEqual:@"end"] || [action isEqual:@"decline"]) control.contentTintColor = NSColor.systemRedColor;
      x += width + 4;
    }

  }
  NSDictionary *test = _model[@"testCall"];
  if (test) {
    y -= 108; NSTextField *caption = label(@"Test call · local simulation", NSMakeRect(20, y + 76, 315, 18), 12); caption.textColor = NSColor.systemOrangeColor; [view addSubview:caption];
    [view addSubview:label([NSString stringWithFormat:@"%@%@", @{@"ringing":@"Incoming call", @"active":@"On a call", @"held":@"On hold"}[test[@"phase"]] ?: test[@"phase"], [test[@"muted"] boolValue] ? @" · Muted" : @""], NSMakeRect(20, y + 52, 315, 18), 13)];
    NSArray *actions = [test[@"phase"] isEqual:@"ringing"] ? @[@"answer", @"decline"] : @[[test[@"muted"] boolValue] ? @"unmute" : @"mute", [test[@"phase"] isEqual:@"held"] ? @"resume" : @"hold", @"end"];
    CGFloat x = 18; for (NSString *action in actions) { [self action:action.capitalizedString command:@{@"type":@"test-call-action", @"callId":test[@"id"], @"action":action} frame:NSMakeRect(x, y + 18, 82, 26) parent:view]; x += 88; }
  }
  if (history) {
    y -= 30; NSTextField *heading = label(@"Recent activity", NSMakeRect(20, y + 8, 315, 18), 12); heading.textColor = NSColor.secondaryLabelColor; [view addSubview:heading];
    for (NSUInteger i = 0; i < history; ++i) {
      NSDictionary *event = recent[i]; y -= 50; NSString *name = @""; for (NSDictionary *account in accounts) if ([account[@"id"] isEqual:event[@"workspaceId"]]) name = account[@"name"];
      ActivityAction *button = [self action:[NSString stringWithFormat:@"%@ · %@", name, event[@"title"]] command:@{@"type":@"open-activity", @"id":event[@"id"]} frame:NSMakeRect(18, y + 20, 320, 25) parent:view]; button.bezelStyle = NSBezelStyleToolbar; button.showsBorderOnlyWhileMouseInside = YES; button.alignment = NSTextAlignmentLeft;
      NSTextField *body = label(event[@"body"], NSMakeRect(24, y + 2, 310, 16), 11); body.textColor = NSColor.secondaryLabelColor; [view addSubview:body];
    }
  } else { y -= 40; NSTextField *empty = label(@"New Quo alerts appear here while Switchboard runs.", NSMakeRect(20, y + 12, 320, 16), 11); empty.textColor = NSColor.secondaryLabelColor; [view addSubview:empty]; }
  [self action:@"Open Switchboard" command:@{@"type":@"show"} frame:NSMakeRect(18, 12, 132, 28) parent:view];
  [self action:@"Settings…" command:@{@"type":@"settings"} frame:NSMakeRect(247, 12, 94, 28) parent:view];
  NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 0, 360, MIN(height, 620))]; scroll.drawsBackground = NO; scroll.hasVerticalScroller = height > 620; scroll.documentView = view; [scroll.contentView scrollToPoint:NSMakePoint(0, MAX(0, height - 620))];
  _popover.contentViewController.view = scroll; _popover.contentSize = scroll.frame.size;
}
- (void)dispose { [self close]; for (NSStatusItem *item in _items.allValues) [NSStatusBar.systemStatusBar removeStatusItem:item]; [_items removeAllObjects]; _popover.delegate = nil; _popover = nil; if (_callback) { napi_release_threadsafe_function(_callback, napi_tsfn_abort); _callback = nullptr; } }
@end
static ActivityController *activityController;
static napi_value statusAttach(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr); napi_valuetype type;
  if (!count || napi_typeof(env, arg, &type) != napi_ok || type != napi_function || !NSThread.isMainThread) { napi_throw_error(env, nullptr, "Status items require a callback on the main thread"); return nullptr; }
  [activityController dispose]; activityController = [[ActivityController alloc] init];
  napi_value resource; napi_create_string_utf8(env, "Switchboard activity", NAPI_AUTO_LENGTH, &resource);
  napi_threadsafe_function callback; if (napi_create_threadsafe_function(env, arg, nullptr, resource, 64, 1, nullptr, nullptr, nullptr, deliver, &callback) == napi_ok) { napi_unref_threadsafe_function(env, callback); activityController.callback = callback; } return nullptr;
}
static napi_value statusUpdate(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr); NSString *json = count ? stringArgument(env, arg) : nil;
  NSDictionary *model = json ? [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
  if ([model isKindOfClass:NSDictionary.class]) [activityController update:model]; return nullptr;
}
static napi_value statusFrame(napi_env env, napi_callback_info info) { size_t count = 1; napi_value arg; int32_t frame = 0; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr); if (count) napi_get_value_int32(env, arg, &frame); activityController.frame = frame; [activityController draw]; return nullptr; }
static napi_value statusShow(napi_env env, napi_callback_info info) { [activityController show]; return nullptr; }
static napi_value statusInspect(napi_env env, napi_callback_info info) {
  NSMutableArray *items = [NSMutableArray array];
  for (NSDictionary *descriptor in activityController.model[@"items"]) {
    NSStatusItem *item = activityController.items[descriptor[@"id"]];
    NSData *png = [[NSBitmapImageRep imageRepWithData:item.button.image.TIFFRepresentation] representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    [items addObject:@{@"id":descriptor[@"id"], @"title":item.button.title ?: @"", @"image":[png base64EncodedStringWithOptions:0] ?: @"", @"visible":@(item.visible)}];
  }
  NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:items options:0 error:nil] encoding:NSUTF8StringEncoding];
  napi_value result; napi_create_string_utf8(env, json.UTF8String ?: "[]", NAPI_AUTO_LENGTH, &result); return result;
}
static napi_value statusDispose(napi_env env, napi_callback_info info) { [activityController dispose]; activityController = nil; return nullptr; }
