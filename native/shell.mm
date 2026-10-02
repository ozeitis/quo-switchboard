#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#include <node_api.h>
#include <string>

// The material is decorative. Masked-out areas must leave Quo's controls reachable.
API_AVAILABLE(macos(26.0))
@interface ChromeGlassView : NSGlassEffectView
@end
@implementation ChromeGlassView
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end
@interface ChromeVibrancyView : NSVisualEffectView
@end
@implementation ChromeVibrancyView
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end

// Build with the macOS 26 SDK or newer. Older systems retain native vibrancy.
static NSView *material(NSRect frame, NSView *content) {
  if (@available(macOS 26.0, *)) {
    NSGlassEffectView *view = [[ChromeGlassView alloc] initWithFrame:frame];
    view.cornerRadius = 0;
    view.contentView = content;
    return view;
  }
  NSVisualEffectView *view = [[ChromeVibrancyView alloc] initWithFrame:frame];
  view.material = NSVisualEffectMaterialSidebar;
  view.blendingMode = NSVisualEffectBlendingModeBehindWindow;
  view.state = NSVisualEffectStateFollowsWindowActiveState;
  content.frame = view.bounds;
  content.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [view addSubview:content];
  return view;
}

@interface FlippedView : NSView
@end
@implementation FlippedView
- (BOOL)isFlipped { return YES; }
- (BOOL)mouseDownCanMoveWindow { return YES; }
@end

@interface WorkspaceCell : NSTableCellView
@property NSTextField *detail;
@end
@implementation WorkspaceCell
- (void)setBackgroundStyle:(NSBackgroundStyle)style {
  [super setBackgroundStyle:style];
  self.textField.textColor = NSColor.labelColor;
  self.detail.textColor = NSColor.secondaryLabelColor;
}
@end

@interface WorkspaceRow : NSTableRowView
@property NSColor *accent;
@end
@implementation WorkspaceRow
- (void)drawSelectionInRect:(NSRect)dirtyRect {
  NSColor *tint = self.emphasized ? [(_accent ?: NSColor.controlAccentColor) colorWithAlphaComponent:0.13] : [NSColor.unemphasizedSelectedContentBackgroundColor colorWithAlphaComponent:0.6];
  [tint setFill];
  NSBezierPath *shape = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(self.bounds, 2, 4) xRadius:12 yRadius:12];
  [shape fill];
  if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldIncreaseContrast) { [NSColor.labelColor setStroke]; shape.lineWidth = 1; [shape stroke]; }
}
@end

static NSTextField *label(NSString *text, NSRect frame, CGFloat size) {
  NSTextField *field = [NSTextField labelWithString:text];
  field.frame = frame;
  field.font = [NSFont systemFontOfSize:size];
  field.lineBreakMode = NSLineBreakByTruncatingTail;
  return field;
}

static NSString *status(NSDictionary *account) {
  if ([account[@"simulation"] boolValue]) return [NSString stringWithFormat:@"Test call · %@%@", @{@"ringing":@"Incoming call", @"active":@"On a call", @"held":@"On hold"}[account[@"callPhase"]] ?: account[@"callPhase"], [account[@"muted"] boolValue] ? @" · Muted" : @""];
  if ([account[@"ringing"] boolValue] && ![account[@"inCall"] boolValue]) return @"Incoming call";
  if ([account[@"inCall"] boolValue]) {
    NSString *state = @{@"held":@"On hold", @"dialing":@"Dialing…", @"connecting":@"Connecting…", @"reconnecting":@"Reconnecting…", @"transferring":@"Transferring…", @"ending":@"Ending call…"}[account[@"callPhase"]] ?: @"On a call";
    if ([account[@"muted"] boolValue]) state = [state stringByAppendingString:@" · Muted"];
    return [account[@"ringing"] boolValue] ? [@"Call waiting · " stringByAppendingString:state] : state;
  }
  return @{@"loading": @"Opening…", @"ready": @"Workspace loaded", @"sign-in": @"Sign-in required", @"offline": @"Offline", @"error": @"Could not load"}[account[@"status"]] ?: @"";
}

static NSColor *color(NSString *name) {
  return @{@"slate": NSColor.secondaryLabelColor, @"blue": NSColor.systemBlueColor,
    @"green": NSColor.systemGreenColor, @"amber": NSColor.systemOrangeColor,
    @"rose": NSColor.systemPinkColor, @"violet": NSColor.systemPurpleColor}[name] ?: NSColor.controlAccentColor;
}

static NSColor *hexColor(NSString *hex) {
  if (![hex isKindOfClass:NSString.class] || hex.length != 7 || ![hex hasPrefix:@"#"]) return NSColor.controlAccentColor;
  unsigned value = 0; [[NSScanner scannerWithString:[hex substringFromIndex:1]] scanHexInt:&value];
  return [NSColor colorWithSRGBRed:((value >> 16) & 255) / 255.0 green:((value >> 8) & 255) / 255.0 blue:(value & 255) / 255.0 alpha:1];
}
static NSString *hexString(NSColor *color) {
  NSColor *rgb = [color colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
  return [NSString stringWithFormat:@"#%02x%02x%02x", (int)round(rgb.redComponent * 255), (int)round(rgb.greenComponent * 255), (int)round(rgb.blueComponent * 255)];
}
static NSColor *callColor(NSString *phase) {
  if ([phase isEqual:@"ringing"]) return NSColor.systemRedColor;
  if ([phase isEqual:@"held"]) return NSColor.systemOrangeColor;
  if ([phase isEqual:@"reconnecting"] || [phase isEqual:@"ending"]) return NSColor.systemOrangeColor;
  if ([phase isEqual:@"active"]) return NSColor.systemGreenColor;
  return NSColor.systemBlueColor;
}
static NSString *callSymbol(NSString *phase) {
  return @{@"ringing":@"phone.badge.waveform.fill", @"held":@"pause.fill", @"reconnecting":@"arrow.clockwise", @"transferring":@"arrow.right", @"ending":@"phone.down.fill", @"dialing":@"phone.arrow.up.right", @"connecting":@"phone.connection.fill"}[phase] ?: @"phone.fill";
}

@interface WorkspaceAvatar : NSView
@property NSDictionary *account;
@end
@implementation WorkspaceAvatar
- (void)drawRect:(NSRect)dirtyRect {
  NSColor *tint = (_account[@"accent"] ?: _account[@"themeAccent"]) ? hexColor(_account[@"accent"] ?: _account[@"themeAccent"]) : color(_account[@"color"]);
  [[tint colorWithAlphaComponent:0.14] setFill];
  [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:9 yRadius:9] fill];
  NSMutableString *initials = [NSMutableString string];
  for (NSString *word in [_account[@"name"] componentsSeparatedByCharactersInSet:NSCharacterSet.whitespaceCharacterSet]) {
    if (word.length) [initials appendString:[word substringWithRange:[word rangeOfComposedCharacterSequenceAtIndex:0]]];
    if (initials.length >= 2) break;
  }
  NSDictionary *attributes = @{NSFontAttributeName: [NSFont systemFontOfSize:11 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: NSColor.labelColor};
  NSSize size = [initials.uppercaseString sizeWithAttributes:attributes];
  [initials.uppercaseString drawAtPoint:NSMakePoint((self.bounds.size.width - size.width) / 2, (self.bounds.size.height - size.height) / 2) withAttributes:attributes];
}
@end

@interface WorkspaceBadge : NSView
@property NSString *text;
@property BOOL calling;
@property NSString *phase;
@end
@implementation WorkspaceBadge
- (void)drawRect:(NSRect)dirtyRect {
  [(_calling ? callColor(_phase) : NSColor.systemRedColor) setFill];
  [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:7 yRadius:7] fill];
  if (_calling) {
    NSImage *symbol = [NSImage imageWithSystemSymbolName:callSymbol(_phase) accessibilityDescription:nil];
    symbol = [symbol imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPaletteColors:@[NSColor.whiteColor]]];
    [symbol drawInRect:NSInsetRect(self.bounds, 3, 3)];
    return;
  }
  NSDictionary *attributes = @{NSFontAttributeName: [NSFont systemFontOfSize:9 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: NSColor.whiteColor};
  NSSize size = [_text sizeWithAttributes:attributes];
  [_text drawAtPoint:NSMakePoint((self.bounds.size.width - size.width) / 2, (self.bounds.size.height - size.height) / 2) withAttributes:attributes];
}
@end

static NSImage *themePreview(NSDictionary *colors) {
  NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(88, 48)];
  [image lockFocus];
  [hexColor(colors[@"surface"]) setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(0, 0, 88, 48) xRadius:7 yRadius:7] fill];
  [hexColor(colors[@"sidebar"]) setFill]; NSRectFill(NSMakeRect(4, 4, 22, 40));
  [hexColor(colors[@"accent"]) setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(7, 28, 16, 6) xRadius:3 yRadius:3] fill];
  [hexColor(colors[@"secondary"]) setFill]; NSRectFill(NSMakeRect(32, 34, 28, 2)); NSRectFill(NSMakeRect(32, 27, 45, 2));
  [hexColor(colors[@"selection"]) setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(32, 8, 48, 13) xRadius:4 yRadius:4] fill];
  [image unlockFocus]; return image;
}

@interface ShellController : NSObject <NSTableViewDataSource, NSTableViewDelegate, NSMenuDelegate, NSTextFieldDelegate, NSWindowDelegate>
@property(weak) NSWindow *window;
@property(weak) NSView *host;
@property NSArray *originalAccessibilityChildren;
@property NSView *chrome;
@property CAShapeLayer *chromeMask;
@property NSView *sidebar;
@property NSView *toolbar;
@property NSDictionary *layout;
@property NSTableView *table;
@property NSTextField *title;
@property NSButton *collapse;
@property NSScrollView *scroll;
@property NSTextField *heading;
@property BOOL collapsed;
@property NSButton *more;
@property NSButton *add;
@property NSDictionary *snapshot;
@property NSArray<NSDictionary *> *accounts;
@property NSAlert *sheet;
@property NSTextField *nameField;
@property BOOL updating;
@property NSWindow *settingsWindow;
@property NSSegmentedControl *settingsTabs;
@property NSView *settingsBody;
@property NSPopUpButton *microphone;
@property NSPopUpButton *diagnosticWorkspace;
@property NSTextField *audioStatus;
@property NSTextField *audioSync;
@property NSLevelIndicator *audioMeter;
@property NSButton *audioTest;
@property NSButton *audioRefresh;
@property NSScrollView *audioSyncScroll;
@property NSString *themeId;
@property NSMutableDictionary *themeDraft;
@property NSArray<NSButton *> *themeCards;
@property NSSegmentedControl *themeMode;
@property NSColorWell *themeWell;
@property NSTextField *themeStatus;
@property napi_threadsafe_function callback;
- (void)emit:(NSDictionary *)command;
- (void)update:(NSDictionary *)snapshot;
- (void)form:(NSString *)identifier;
- (void)theme:(NSString *)identifier;
- (void)dismiss;
- (void)dispose;
@end

@interface ShellController (Settings)
- (void)settings;
- (void)refreshAudioSettings;
@end

@implementation ShellController
- (NSButton *)button:(NSString *)title symbol:(NSString *)symbol frame:(NSRect)frame action:(SEL)action parent:(NSView *)parent {
  NSButton *button = [NSButton buttonWithTitle:title target:self action:action];
  button.frame = frame;
  button.bezelStyle = NSBezelStyleToolbar;
  button.showsBorderOnlyWhileMouseInside = YES;
  button.controlSize = NSControlSizeSmall;
  button.image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:nil];
  button.symbolConfiguration = [NSImageSymbolConfiguration configurationWithPointSize:15 weight:NSFontWeightRegular];
  button.imageScaling = NSImageScaleNone;
  button.imagePosition = title.length ? NSImageLeading : NSImageOnly;
  [parent addSubview:button];
  return button;
}
- (instancetype)initWithView:(NSView *)handle layout:(NSDictionary *)layout callback:(napi_threadsafe_function)callback {
  if (!(self = [super init])) return nil;
  _window = handle.window;
  _callback = callback;
  _layout = layout;
  _accounts = @[];
  NSView *host = _window.contentView;
  _host = host;
  _window.movableByWindowBackground = YES;
  _window.autorecalculatesKeyViewLoop = YES;
  CGFloat width = host.bounds.size.width, height = host.bounds.size.height;
  CGFloat sidebarWidth = [layout[@"sidebarWidth"] doubleValue];
  CGFloat toolbarHeight = [layout[@"toolbarHeight"] doubleValue];
  CGFloat rowHeight = [layout[@"rowHeight"] doubleValue];
  // One material across the window avoids a glass edge at the toolbar junction.
  _chrome = material(host.bounds, [[FlippedView alloc] initWithFrame:host.bounds]);
  _chrome.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  _chrome.accessibilityElement = NO;
  _chrome.wantsLayer = YES;
  _chromeMask = [CAShapeLayer layer];
  _chromeMask.fillRule = kCAFillRuleEvenOdd;
  _chrome.layer.mask = _chromeMask;
  [host addSubview:_chrome positioned:NSWindowAbove relativeTo:nil];
  FlippedView *side = [[FlippedView alloc] initWithFrame:NSMakeRect(0, 0, sidebarWidth, height)];
  _sidebar = side;
  _sidebar.autoresizingMask = NSViewHeightSizable;
  [host addSubview:_sidebar positioned:NSWindowAbove relativeTo:nil];
  _heading = label(@"Workspaces", NSMakeRect(16, toolbarHeight + 12, sidebarWidth - 32, 18), 11);
  _heading.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
  _heading.textColor = NSColor.secondaryLabelColor;
  [side addSubview:_heading];
  NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(8, toolbarHeight + 38, sidebarWidth - 16, MAX(100, height - toolbarHeight - 54))];
  _scroll = scroll;
  scroll.autoresizingMask = NSViewHeightSizable;
  scroll.hasVerticalScroller = YES;
  scroll.autohidesScrollers = YES;
  scroll.scrollerStyle = NSScrollerStyleOverlay;
  scroll.drawsBackground = NO;
  scroll.contentView.drawsBackground = NO;
  _table = [[NSTableView alloc] initWithFrame:scroll.bounds];
  _table.headerView = nil;
  _table.backgroundColor = NSColor.clearColor;
  // The row supplies its own inset. Keep AppKit's extra gutters out of its width.
  _table.style = NSTableViewStylePlain;
  _table.rowHeight = rowHeight;
  _table.intercellSpacing = NSMakeSize(0, 2);
  _table.allowsEmptySelection = NO;
  _table.allowsMultipleSelection = NO;
  _table.dataSource = self;
  _table.delegate = self;
  _table.accessibilityLabel = @"Workspaces";
  NSTableColumn *column = [[NSTableColumn alloc] initWithIdentifier:@"workspace"];
  column.minWidth = 0;
  column.width = sidebarWidth - 16;
  [_table addTableColumn:column];
  scroll.documentView = _table;
  NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Workspace"];
  menu.delegate = self;
  _table.menu = menu;
  [side addSubview:scroll];

  FlippedView *bar = [[FlippedView alloc] initWithFrame:NSMakeRect(0, 0, width, toolbarHeight)];
  _toolbar = bar;
  _toolbar.frame = NSMakeRect(0, height - toolbarHeight, width, toolbarHeight);
  _toolbar.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
  [host addSubview:_toolbar positioned:NSWindowAbove relativeTo:nil];
  _title = label(@"Switchboard", NSMakeRect(sidebarWidth + 12, (toolbarHeight - 20) / 2, width - sidebarWidth - 116, 20), 13);
  _title.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
  _title.autoresizingMask = NSViewWidthSizable;
  [bar addSubview:_title];
  _collapse = [self button:@"" symbol:@"sidebar.left" frame:NSMakeRect(88, (toolbarHeight - 28) / 2, 28, 28) action:@selector(toggleSidebar:) parent:bar];
  _collapse.toolTip = @"Collapse sidebar (⌘⇧L)";
  _collapse.accessibilityLabel = @"Collapse sidebar";
  _add = [self button:@"" symbol:@"plus" frame:NSMakeRect(width - 80, (toolbarHeight - 28) / 2, 28, 28) action:@selector(addWorkspace:) parent:bar];
  _add.autoresizingMask = NSViewMinXMargin;
  _add.toolTip = @"New workspace (⌘N)";
  _add.accessibilityLabel = @"New workspace";
  _more = [self button:@"" symbol:@"ellipsis" frame:NSMakeRect(width - 44, (toolbarHeight - 28) / 2, 28, 28) action:@selector(more:) parent:bar];
  _more.autoresizingMask = NSViewMinXMargin;
  _more.toolTip = @"Workspace options";
  _more.accessibilityLabel = @"Workspace options";
  // Chromium supplies its own accessibility children. Include native siblings
  // explicitly so VoiceOver and Full Keyboard Access can reach AppKit controls.
  _sidebar.accessibilityElement = YES;
  _sidebar.accessibilityRole = NSAccessibilityGroupRole;
  _sidebar.accessibilityLabel = @"Workspace sidebar";
  _toolbar.accessibilityElement = YES;
  _toolbar.accessibilityRole = NSAccessibilityGroupRole;
  _toolbar.accessibilityLabel = @"Workspace toolbar";
  _originalAccessibilityChildren = _window.accessibilityChildren ?: @[];
  _window.accessibilityChildren = [_originalAccessibilityChildren arrayByAddingObjectsFromArray:@[_sidebar, _toolbar]];
  _sidebar.accessibilityParent = _window;
  _toolbar.accessibilityParent = _window;
  [NSWorkspace.sharedWorkspace.notificationCenter addObserver:self selector:@selector(accessibilityChanged:) name:NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification object:nil];
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(accessibilityChanged:) name:NSSystemColorsDidChangeNotification object:nil];
  return self;
}
- (void)accessibilityChanged:(NSNotification *)notification { [self emit:@{@"type":@"appearance-changed"}]; }
- (void)emit:(NSDictionary *)command {
  if (!_callback) return;
  NSData *json = [NSJSONSerialization dataWithJSONObject:command options:0 error:nil];
  auto *data = new std::string((const char *)json.bytes, json.length);
  if (napi_call_threadsafe_function(_callback, data, napi_tsfn_nonblocking) != napi_ok) delete data;
}
- (void)update:(NSDictionary *)snapshot {
  // Electron can reorder its hosting view when a WebContentsView becomes visible.
  [_host addSubview:_chrome positioned:NSWindowAbove relativeTo:nil];
  [_host addSubview:_sidebar positioned:NSWindowAbove relativeTo:nil];
  [_host addSubview:_toolbar positioned:NSWindowAbove relativeTo:nil];
  _updating = YES;
  NSDictionary *appearance = snapshot[@"appearance"];
  NSDictionary *activeState = nil;
  for (NSDictionary *account in snapshot[@"accounts"]) if ([account[@"id"] isEqual:snapshot[@"activeId"]]) activeState = account;
  BOOL original = [appearance[@"resolved"][@"original"] boolValue] || [activeState[@"themeSupport"] isEqual:@"unsupported"];
  NSString *mode = appearance[@"theme"][@"mode"];
  _window.appearance = original || [mode isEqual:@"system"] ? nil : [NSAppearance appearanceNamed:[mode isEqual:@"dark"] ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
  if (@available(macOS 26.0, *)) ((NSGlassEffectView *)_chrome).tintColor = original ? nil : [hexColor(appearance[@"resolved"][@"colors"][@"accentText"]) colorWithAlphaComponent:0.06];
  BOOL collapseChanged = _collapsed != [snapshot[@"sidebarCollapsed"] boolValue];
  _collapsed = [snapshot[@"sidebarCollapsed"] boolValue];
  CGFloat inset = [_layout[_collapsed ? @"railWidth" : @"sidebarWidth"] doubleValue];
  CGFloat toolbarHeight = [_layout[@"toolbarHeight"] doubleValue];
  CGFloat width = _host.bounds.size.width, height = _host.bounds.size.height;
  // Cut out the full page area, retaining only its top-left curve. The native
  // window owns the outer corners; no inset frame or remote-page CSS is needed.
  CGFloat radius = [_layout[@"contentRadius"] doubleValue], top = height - toolbarHeight;
  CGFloat tangent = radius * 0.5522847498;
  CGMutablePathRef path = CGPathCreateMutable();
  CGPathAddRect(path, nil, CGRectMake(0, 0, width, height));
  CGPathMoveToPoint(path, nil, inset, 0);
  CGPathAddLineToPoint(path, nil, width, 0);
  CGPathAddLineToPoint(path, nil, width, top);
  CGPathAddLineToPoint(path, nil, inset + radius, top);
  CGPathAddCurveToPoint(path, nil, inset + radius - tangent, top, inset, top - radius + tangent, inset, top - radius);
  CGPathCloseSubpath(path);
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  _chromeMask.frame = CGRectMake(0, 0, width, height);
  _chromeMask.path = path;
  [CATransaction commit];
  CGPathRelease(path);
  _sidebar.frame = NSMakeRect(0, 0, inset, height);
  _toolbar.frame = NSMakeRect(0, height - toolbarHeight, width, toolbarHeight);
  CGFloat titleX = MAX(inset + 12, 128);
  _title.frame = NSMakeRect(titleX, (toolbarHeight - 20) / 2, MAX(100, width - titleX - 104), 20);
  _heading.hidden = _collapsed;
  CGFloat listTop = toolbarHeight + (_collapsed ? 8 : 38);
  _scroll.frame = NSMakeRect(8, listTop, inset - 16, MAX(100, height - listTop - 8));
  _table.tableColumns.firstObject.width = _scroll.contentSize.width;
  [_table sizeToFit];
  _collapse.accessibilityLabel = _collapsed ? @"Expand sidebar" : @"Collapse sidebar";
  _collapse.toolTip = _collapsed ? @"Expand sidebar (⌘⇧L)" : @"Collapse sidebar (⌘⇧L)";
  BOOL changed = ![_snapshot[@"appearance"] isEqual:snapshot[@"appearance"]] || ![_snapshot[@"preferences"][@"animateActivity"] isEqual:snapshot[@"preferences"][@"animateActivity"]] || collapseChanged || ![_accounts isEqual:snapshot[@"accounts"]] || ![_snapshot[@"activeId"] isEqual:snapshot[@"activeId"]];
  _snapshot = snapshot;
  _accounts = snapshot[@"accounts"] ?: @[];
  if (snapshot[@"testCall"]) {
    NSMutableArray *visual = [NSMutableArray array]; NSDictionary *test = snapshot[@"testCall"];
    for (NSDictionary *account in _accounts) {
      NSMutableDictionary *copy = [account mutableCopy];
      if ([account[@"id"] isEqual:test[@"workspaceId"]]) { copy[@"simulation"] = @YES; copy[@"ringing"] = @([test[@"phase"] isEqual:@"ringing"]); copy[@"inCall"] = @(![test[@"phase"] isEqual:@"ringing"]); copy[@"callPhase"] = test[@"phase"]; copy[@"muted"] = test[@"muted"]; }
      [visual addObject:copy];
    }
    _accounts = visual;
  }
  NSInteger selected = -1;
  for (NSUInteger i = 0; i < _accounts.count; ++i) if ([_accounts[i][@"id"] isEqual:snapshot[@"activeId"]]) selected = i;
  if (changed) {
    [_table reloadData];
    if (selected >= 0) [_table selectRowIndexes:[NSIndexSet indexSetWithIndex:selected] byExtendingSelection:NO];
    else [_table deselectAll:nil];
  }
  NSDictionary *active = selected >= 0 ? _accounts[selected] : nil;
  BOOL showStatus = active && (![active[@"status"] isEqual:@"ready"] || [active[@"inCall"] boolValue] || [active[@"ringing"] boolValue]);
  _title.stringValue = showStatus ? [NSString stringWithFormat:@"%@ — %@", active[@"name"], status(active)] : active[@"name"] ?: @"Switchboard";
  _title.toolTip = active ? status(active) : nil;
  _more.enabled = YES;
  _add.enabled = _accounts.count < 12;
  _updating = NO;
  [self refreshThemeCards]; [self refreshAudioSettings];
  if (collapseChanged && !NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion && [_snapshot[@"preferences"][@"animateActivity"] boolValue]) {
    _table.alphaValue = 0;
    [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
      context.duration = 0.16;
      _table.animator.alphaValue = 1;
    } completionHandler:nil];
  }
}
- (NSInteger)numberOfRowsInTableView:(NSTableView *)table { return _accounts.count; }
- (NSTableRowView *)tableView:(NSTableView *)table rowViewForRow:(NSInteger)row { WorkspaceRow *view = [[WorkspaceRow alloc] init]; view.accent = _accounts[row][@"themeAccent"] ? hexColor(_accounts[row][@"themeAccent"]) : NSColor.controlAccentColor; return view; }
- (NSView *)tableView:(NSTableView *)table viewForTableColumn:(NSTableColumn *)column row:(NSInteger)row {
  NSDictionary *account = _accounts[row];
  CGFloat rowHeight = [_layout[@"rowHeight"] doubleValue];
  WorkspaceCell *cell = [[WorkspaceCell alloc] initWithFrame:NSMakeRect(0, 0, column.width, rowHeight)];
  WorkspaceAvatar *avatar = [[WorkspaceAvatar alloc] initWithFrame:NSMakeRect(_collapsed ? (column.width - 28) / 2 : 8, (rowHeight - 28) / 2, 28, 28)];
  avatar.account = account;
  [cell addSubview:avatar];
  if (!_collapsed) {
    BOOL showDetail = ![account[@"status"] isEqual:@"ready"] || [account[@"inCall"] boolValue] || [account[@"ringing"] boolValue];
    CGFloat nameWidth = column.width - 43 - ([account[@"unread"] integerValue] ? 33 : 8);
    NSTextField *name = label(account[@"name"], NSMakeRect(43, showDetail ? 26 : (rowHeight - 18) / 2, nameWidth, 18), 13);
    [cell addSubview:name];
    cell.textField = name;
    name.font = [NSFont systemFontOfSize:13 weight:[account[@"id"] isEqual:_snapshot[@"activeId"]] ? NSFontWeightSemibold : NSFontWeightRegular];
    cell.detail = label(status(account), NSMakeRect(43, 9, column.width - 51, 16), 10);
    cell.detail.hidden = !showDetail;
    cell.detail.textColor = NSColor.secondaryLabelColor;
    [cell addSubview:cell.detail];
  }
  NSInteger count = [account[@"unread"] integerValue];
  BOOL calling = [account[@"ringing"] boolValue] || [account[@"inCall"] boolValue];
  if (count) {
    CGFloat badgeWidth = count > 99 ? 25 : 20;
    WorkspaceBadge *badge = [[WorkspaceBadge alloc] initWithFrame:NSMakeRect(column.width - badgeWidth, _collapsed ? rowHeight - 17 : rowHeight - 19, badgeWidth, 15)];
    badge.text = count > 99 ? @"99+" : [NSString stringWithFormat:@"%ld", (long)count];
    [cell addSubview:badge];
  }
  if (calling) {
    WorkspaceBadge *call = [[WorkspaceBadge alloc] initWithFrame:NSMakeRect(_collapsed ? NSMaxX(avatar.frame) - 9 : 27, 5, 15, 15)];
    call.calling = YES;
    call.phase = [account[@"ringing"] boolValue] ? @"ringing" : account[@"callPhase"];
    [cell addSubview:call];
    if ([call.phase isEqual:@"ringing"] && !NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion && [_snapshot[@"preferences"][@"animateActivity"] boolValue]) {
      call.wantsLayer = YES;
      CABasicAnimation *pulse = [CABasicAnimation animationWithKeyPath:@"opacity"];
      pulse.fromValue = @1; pulse.toValue = @0.55; pulse.duration = 0.65; pulse.autoreverses = YES; pulse.repeatCount = HUGE_VALF;
      [call.layer addAnimation:pulse forKey:@"ringing"];
    }
  }
  cell.accessibilityElement = YES;
  cell.accessibilityRole = NSAccessibilityGroupRole;
  NSString *unread = [account[@"unreadKnown"] boolValue] ? [NSString stringWithFormat:@"%ld unread", (long)count]
    : count ? [NSString stringWithFormat:@"At least %ld unread", (long)count] : @"Unread unavailable";
  cell.accessibilityLabel = [NSString stringWithFormat:@"%@, %@, %@", account[@"name"], status(account), unread];
  cell.toolTip = [NSString stringWithFormat:@"%@ — %@%@", account[@"name"], status(account), row < 9 ? [NSString stringWithFormat:@" (⌘%ld)", (long)row + 1] : @""];
  return cell;
}
- (void)tableViewSelectionDidChange:(NSNotification *)notification {
  NSInteger row = _table.selectedRow;
  if (!_updating && row >= 0 && row < (NSInteger)_accounts.count) [self emit:@{@"type": @"select", @"id": _accounts[row][@"id"]}];
}
- (void)menuNeedsUpdate:(NSMenu *)menu {
  [menu removeAllItems];
  NSInteger row = _table.clickedRow;
  if (row < 0 || row >= (NSInteger)_accounts.count) return;
  [self populateMenu:menu account:_accounts[row] index:row];
}
- (void)populateMenu:(NSMenu *)menu account:(NSDictionary *)account index:(NSInteger)index {
  NSArray *titles = @[@"Edit workspace…", @"Workspace theme…", @"Reload workspace", @"Move up", @"Move down", @"Remove workspace…"];
  NSArray *actions = @[@"edit", @"workspace-theme", @"reload", @"move-up", @"move-down", @"remove"];
  menu.autoenablesItems = NO;
  for (NSUInteger i = 0; i < titles.count; ++i) {
    if (i == 3 || i == 5) [menu addItem:NSMenuItem.separatorItem];
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:titles[i] action:@selector(menuAction:) keyEquivalent:@""];
    item.target = self;
    item.representedObject = @{@"type": actions[i], @"id": account[@"id"]};
    item.enabled = !(i == 3 && index == 0) && !(i == 4 && index == (NSInteger)_accounts.count - 1);
    [menu addItem:item];
  }
}
- (void)menuAction:(NSMenuItem *)item {
  NSDictionary *command = item.representedObject;
  if ([command[@"type"] isEqual:@"edit"]) [self form:command[@"id"]];
  else [self emit:command];
}
- (void)more:(id)sender {
  NSString *identifier = _snapshot[@"activeId"];
  NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Workspace"];
  for (NSUInteger i = 0; i < _accounts.count; ++i) if ([_accounts[i][@"id"] isEqual:identifier]) {
    [self populateMenu:menu account:_accounts[i] index:i];
    [menu addItem:NSMenuItem.separatorItem];
  }
  for (NSArray *entry in @[@[@"Settings…", @"settings"], @[@"Connection health…", @"health"]]) {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:entry[0] action:@selector(menuAction:) keyEquivalent:@""];
    item.target = self;
    item.representedObject = @{@"type": entry[1]};
    [menu addItem:item];
  }
  [menu popUpMenuPositioningItem:nil atLocation:NSMakePoint(0, _more.bounds.size.height + 4) inView:_more];
}
- (void)toggleSidebar:(id)sender { [self emit:@{@"type": @"toggle-sidebar"}]; }
- (void)addWorkspace:(id)sender { [self form:nil]; }
- (BOOL)validName {
  NSString *value = [_nameField.stringValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  return value.length > 0 && value.length <= 48 && [value rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location == NSNotFound;
}
- (void)controlTextDidChange:(NSNotification *)notification { _sheet.buttons.firstObject.enabled = [self validName]; }
- (void)form:(NSString *)identifier {
  if (_window.attachedSheet) { [_window.attachedSheet makeKeyAndOrderFront:nil]; return; }
  if (!identifier && _accounts.count >= 12) { [self emit:@{@"type": @"workspace-limit"}]; return; }
  NSDictionary *account = nil;
  for (NSDictionary *item in _accounts) if ([item[@"id"] isEqual:identifier]) account = item;
  if (identifier && !account) return;
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = account ? @"Edit workspace" : @"New workspace";
  alert.informativeText = account ? @"The name and color only change how this workspace appears in Switchboard." : @"Choose a name and color. Then sign in to Quo. Each workspace keeps its own sign-in.";
  [alert addButtonWithTitle:account ? @"Save" : @"Create workspace"];
  [alert addButtonWithTitle:@"Cancel"];
  NSView *fields = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 340, 108)];
  [fields addSubview:label(@"Workspace name", NSMakeRect(0, 84, 330, 18), 12)];
  NSTextField *name = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 52, 340, 26)];
  name.placeholderString = @"e.g. Acme Studio";
  name.stringValue = account[@"name"] ?: @"";
  name.accessibilityLabel = @"Workspace name";
  name.delegate = self;
  [fields addSubview:name];
  [fields addSubview:label(@"Color", NSMakeRect(0, 10, 65, 20), 12)];
  NSPopUpButton *colors = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(70, 5, 270, 28) pullsDown:NO];
  NSArray *values = @[@"slate", @"blue", @"green", @"amber", @"rose", @"violet"];
  for (NSString *value in values) {
    [colors addItemWithTitle:value.capitalizedString];
    colors.lastItem.representedObject = value;
  }
  [colors selectItemAtIndex:[values indexOfObject:account[@"color"] ?: values[_accounts.count % values.count]]];
  colors.accessibilityLabel = @"Workspace color";
  [fields addSubview:colors];
  alert.accessoryView = fields;
  alert.window.preventsApplicationTerminationWhenModal = NO;
  _sheet = alert;
  _nameField = name;
  alert.buttons.firstObject.enabled = [self validName];
  __weak ShellController *weakSelf = self;
  [alert beginSheetModalForWindow:_window completionHandler:^(NSModalResponse response) {
    ShellController *owner = weakSelf;
    if (response == NSAlertFirstButtonReturn && [owner validName]) {
      NSMutableDictionary *command = [@{@"type": account ? @"rename" : @"add", @"name": [name.stringValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet], @"color": colors.selectedItem.representedObject} mutableCopy];
      if (identifier) command[@"id"] = identifier;
      [owner emit:command];
    }
    owner.nameField = nil;
    owner.sheet = nil;
  }];
  [alert.window makeFirstResponder:name];
  name.stringValue = account[@"name"] ?: @"";
  [name selectText:nil];
}
- (void)refreshThemeCards {
  if (!_themeId) return;
  NSArray *catalog = _snapshot[@"themeCatalog"];
  for (NSUInteger i = 0; i < MIN(catalog.count, _themeCards.count); ++i) {
    NSButton *card = _themeCards[i]; card.image = themePreview(catalog[i][@"colors"]);
    card.state = [catalog[i][@"id"] isEqual:_themeDraft[@"preset"]] ? NSControlStateValueOn : NSControlStateValueOff;
  }
  NSString *support = nil;
  for (NSDictionary *account in _accounts) if ([account[@"id"] isEqual:_themeId]) support = account[@"themeSupport"];
  _themeStatus.stringValue = [support isEqual:@"unsupported"] ? @"Quo changed its colors. Original colors are preserved." : [support isEqual:@"waiting"] ? @"Colors apply after this workspace finishes loading." : @"Preview applies to this workspace. Apply saves your choice.";
}
- (void)themeChanged:(id)sender {
  if ([sender isKindOfClass:NSButton.class]) {
    NSArray *catalog = _snapshot[@"themeCatalog"];
    if ([sender tag] < (NSInteger)catalog.count) _themeDraft[@"preset"] = catalog[[sender tag]][@"id"];
  }
  _themeDraft[@"mode"] = @[@"system", @"light", @"dark"][_themeMode.selectedSegment];
  if (sender == _themeWell) { _themeDraft[@"preset"] = @"custom"; _themeDraft[@"accent"] = hexString(_themeWell.color); }
  if ([_themeDraft[@"preset"] isEqual:@"custom"] && !_themeDraft[@"accent"]) _themeDraft[@"accent"] = hexString(_themeWell.color);
  [self refreshThemeCards];
  [self emit:@{@"type":@"preview-theme", @"id":_themeId, @"theme":_themeDraft}];
}
- (void)theme:(NSString *)identifier {
  if (_window.attachedSheet) { [_window.attachedSheet makeKeyAndOrderFront:nil]; return; }
  NSDictionary *account = nil;
  for (NSDictionary *item in _accounts) if ([item[@"id"] isEqual:identifier]) account = item;
  if (!account) return;
  _themeId = identifier;
  _themeDraft = [account[@"theme"] mutableCopy] ?: [@{@"preset":@"quo", @"mode":@"system"} mutableCopy];
  NSAlert *alert = [[NSAlert alloc] init]; alert.messageText = [NSString stringWithFormat:@"Theme for %@", account[@"name"]];
  alert.informativeText = @"Choose a workspace palette. Quo’s call and warning colors keep their meaning.";
  [alert addButtonWithTitle:@"Apply"]; [alert addButtonWithTitle:@"Cancel"];
  NSView *fields = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 460, 284)];
  NSMutableArray *cards = [NSMutableArray array]; NSArray *catalog = _snapshot[@"themeCatalog"];
  for (NSUInteger i = 0; i < catalog.count; ++i) {
    NSButton *card = [NSButton buttonWithTitle:catalog[i][@"name"] target:self action:@selector(themeChanged:)];
    card.frame = NSMakeRect((i % 4) * 116, 190 - (i / 4) * 90, 108, 82);
    card.bezelStyle = NSBezelStyleRegularSquare; card.buttonType = NSButtonTypePushOnPushOff;
    card.imagePosition = NSImageAbove; card.imageScaling = NSImageScaleNone; card.tag = i;
    card.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium]; card.accessibilityLabel = [catalog[i][@"name"] stringByAppendingString:@" theme"];
    [fields addSubview:card]; [cards addObject:card];
  }
  _themeCards = cards;
  [fields addSubview:label(@"Appearance", NSMakeRect(0, 65, 100, 20), 12)];
  _themeMode = [NSSegmentedControl segmentedControlWithLabels:@[@"Automatic", @"Light", @"Dark"] trackingMode:NSSegmentSwitchTrackingSelectOne target:self action:@selector(themeChanged:)];
  _themeMode.frame = NSMakeRect(110, 62, 350, 26); _themeMode.accessibilityLabel = @"Workspace appearance";
  _themeMode.selectedSegment = [@[@"system", @"light", @"dark"] indexOfObject:_themeDraft[@"mode"]]; [fields addSubview:_themeMode];
  [fields addSubview:label(@"Custom accent", NSMakeRect(0, 30, 110, 20), 12)];
  _themeWell = [[NSColorWell alloc] initWithFrame:NSMakeRect(110, 25, 48, 28)]; _themeWell.color = hexColor(_themeDraft[@"accent"] ?: @"#586bd6");
  _themeWell.target = self; _themeWell.action = @selector(themeChanged:); _themeWell.accessibilityLabel = @"Custom accent color"; [fields addSubview:_themeWell];
  _themeStatus = label(@"", NSMakeRect(0, 0, 460, 18), 11); _themeStatus.textColor = NSColor.secondaryLabelColor; [fields addSubview:_themeStatus];
  alert.accessoryView = fields; alert.window.preventsApplicationTerminationWhenModal = NO; _sheet = alert; [self refreshThemeCards];
  __weak ShellController *weakSelf = self;
  [alert beginSheetModalForWindow:_window completionHandler:^(NSModalResponse response) {
    ShellController *owner = weakSelf;
    [owner.themeWell deactivate]; [NSColorPanel.sharedColorPanel close];
    [owner emit:response == NSAlertFirstButtonReturn ? @{@"type":@"save-theme", @"id":identifier, @"theme":owner.themeDraft} : @{@"type":@"cancel-theme", @"id":identifier}];
    owner.themeId = nil; owner.themeDraft = nil; owner.themeCards = nil; owner.themeMode = nil; owner.themeWell = nil; owner.themeStatus = nil; owner.sheet = nil;
  }];
}
- (void)dismiss { if (_window.attachedSheet) [_window endSheet:_window.attachedSheet returnCode:NSModalResponseCancel]; }
- (void)dispose {
  [_settingsWindow close];
  [self dismiss];
  [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self];
  [NSNotificationCenter.defaultCenter removeObserver:self];
  _table.delegate = nil;
  _table.dataSource = nil;
  _table.menu.delegate = nil;
  [_sidebar removeFromSuperview];
  [_toolbar removeFromSuperview];
  [_chrome removeFromSuperview];
  _window.accessibilityChildren = _originalAccessibilityChildren;
  if (_callback) { napi_release_threadsafe_function(_callback, napi_tsfn_abort); _callback = nullptr; }
}
@end

#include "settings.mm"

static ShellController *controller;
static void deliver(napi_env env, napi_value callback, void *, void *data) {
  auto *json = static_cast<std::string *>(data);
  if (env && callback) {
    napi_value value, receiver, result;
    napi_create_string_utf8(env, json->data(), json->size(), &value);
    napi_get_undefined(env, &receiver);
    napi_call_function(env, receiver, callback, 1, &value, &result);
  }
  delete json;
}
static NSString *stringArgument(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) return nil;
  std::string data(length + 1, '\0');
  napi_get_value_string_utf8(env, value, data.data(), data.size(), &length);
  return [[NSString alloc] initWithBytes:data.data() length:length encoding:NSUTF8StringEncoding];
}
static napi_value attach(napi_env env, napi_callback_info info) {
  size_t count = 3, length = 0;
  napi_value args[3];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  void *bytes = nullptr;
  napi_valuetype callbackType;
  if (count != 3 || napi_get_buffer_info(env, args[0], &bytes, &length) != napi_ok || length != sizeof(void *) || napi_typeof(env, args[2], &callbackType) != napi_ok || callbackType != napi_function || !NSThread.isMainThread) {
    napi_throw_error(env, nullptr, "Native shell requires an NSView handle and a callback on the main thread"); return nullptr;
  }
  NSString *json = stringArgument(env, args[1]);
  NSDictionary *layout = json ? [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
  if (![layout isKindOfClass:NSDictionary.class]) { napi_throw_error(env, nullptr, "Native shell requires layout metrics"); return nullptr; }
  for (NSString *key in @[@"sidebarWidth", @"railWidth", @"toolbarHeight", @"rowHeight", @"contentRadius"]) {
    NSNumber *value = layout[key];
    if (![value isKindOfClass:NSNumber.class] || !(value.doubleValue >= ([key isEqual:@"contentRadius"] ? 0 : 24) && value.doubleValue <= 512)) { napi_throw_error(env, nullptr, "Invalid native layout metric"); return nullptr; }
  }
  [controller dispose];
  napi_threadsafe_function callback;
  napi_value resource;
  napi_create_string_utf8(env, "Switchboard AppKit actions", NAPI_AUTO_LENGTH, &resource);
  if (napi_create_threadsafe_function(env, args[2], nullptr, resource, 64, 1, nullptr, nullptr, nullptr, deliver, &callback) != napi_ok) return nullptr;
  napi_unref_threadsafe_function(env, callback);
  NSView *view = (__bridge NSView *)*(void **)bytes;
  controller = [[ShellController alloc] initWithView:view layout:layout callback:callback];
  return nullptr;
}
static napi_value update(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg;
  napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  NSString *json = count ? stringArgument(env, arg) : nil;
  NSDictionary *snapshot = json ? [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
  if ([snapshot isKindOfClass:NSDictionary.class]) [controller update:snapshot];
  return nullptr;
}
static napi_value form(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg;
  napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  [controller form:count ? stringArgument(env, arg) : nil];
  return nullptr;
}
static napi_value theme(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  if (count) [controller theme:stringArgument(env, arg)]; return nullptr;
}
static napi_value environment(napi_env env, napi_callback_info info) {
  if (!NSThread.isMainThread) { napi_throw_error(env, nullptr, "Appearance requires the main thread"); return nullptr; }
  napi_value result, motion, contrast, accent; napi_create_object(env, &result);
  napi_get_boolean(env, NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion, &motion);
  napi_get_boolean(env, NSWorkspace.sharedWorkspace.accessibilityDisplayShouldIncreaseContrast, &contrast);
  napi_create_string_utf8(env, hexString(NSColor.controlAccentColor).UTF8String, NAPI_AUTO_LENGTH, &accent);
  napi_set_named_property(env, result, "reduceMotion", motion); napi_set_named_property(env, result, "increaseContrast", contrast); napi_set_named_property(env, result, "systemAccent", accent);
  return result;
}
static napi_value settings(napi_env env, napi_callback_info info) { [controller settings]; return nullptr; }
static napi_value dismiss(napi_env env, napi_callback_info info) { [controller dismiss]; return nullptr; }
static napi_value dispose(napi_env env, napi_callback_info info) { [controller dispose]; controller = nil; return nullptr; }
#include "activity.mm"

static void cleanup(void *) { [activityController dispose]; activityController = nil; [controller dispose]; controller = nil; }
static napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"statusAttach", nullptr, statusAttach, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"statusUpdate", nullptr, statusUpdate, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"statusFrame", nullptr, statusFrame, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"statusShow", nullptr, statusShow, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"statusInspect", nullptr, statusInspect, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"statusDispose", nullptr, statusDispose, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"attach", nullptr, attach, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"update", nullptr, update, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"form", nullptr, form, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"theme", nullptr, theme, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"environment", nullptr, environment, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"settings", nullptr, settings, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"dismiss", nullptr, dismiss, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"dispose", nullptr, dispose, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  napi_add_env_cleanup_hook(env, cleanup, nullptr);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
