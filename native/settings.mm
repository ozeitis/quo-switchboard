@interface SettingsChoice : NSButton
@property NSString *preference;
@end
@implementation SettingsChoice
@end

@implementation ShellController (Settings)
- (void)settings {
  if (_settingsWindow) { [_settingsWindow makeKeyAndOrderFront:nil]; return; }
  _settingsWindow = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 520, 420) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
  _settingsWindow.title = @"Switchboard Settings"; _settingsWindow.releasedWhenClosed = NO; _settingsWindow.delegate = self; _settingsWindow.autorecalculatesKeyViewLoop = YES; _settingsWindow.appearance = nil;
  [_settingsWindow center]; [_settingsWindow setFrameAutosaveName:@"SwitchboardSettings"];
  NSSegmentedControl *tabs = [NSSegmentedControl segmentedControlWithLabels:@[@"General", @"Audio", @"Diagnostics"] trackingMode:NSSegmentSwitchTrackingSelectOne target:self action:@selector(settingsTabChanged:)];
  tabs.frame = NSMakeRect(20, 372, 480, 28); tabs.selectedSegment = 0; tabs.accessibilityLabel = @"Settings section"; [_settingsWindow.contentView addSubview:tabs];
  _settingsTabs = tabs;
  _settingsBody = [[NSView alloc] initWithFrame:NSMakeRect(20, 18, 480, 336)]; [_settingsWindow.contentView addSubview:_settingsBody];
  [self settingsTabChanged:tabs]; [_settingsWindow makeKeyAndOrderFront:nil];
}
- (void)settingsTabChanged:(NSSegmentedControl *)sender {
  for (NSView *view in _settingsBody.subviews.copy) [view removeFromSuperview];
  _microphone = nil; _audioStatus = nil; _audioMeter = nil; _audioSync = nil; _audioTest = nil; _audioRefresh = nil; _audioSyncScroll = nil;
  [self emit:@{@"type":@"audio-stop"}];
  if (sender.selectedSegment == 0) {
    NSArray *keys = @[@"notifications", @"floatingCalls", @"privateNotifications", @"launchAtLogin", @"showMenuBar", @"menuBarCount", @"experimentalAnswer", @"animateActivity"];
    NSArray *titles = @[@"Desktop notifications", @"Floating incoming call controls", @"Hide caller and message previews", @"Open Switchboard at login", @"Show menu-bar icon", @"Show unread count beside the icon", @"Answer from system notifications (experimental)", @"Animate call activity"];
    for (NSUInteger i = 0; i < keys.count; ++i) {
      SettingsChoice *button = [[SettingsChoice alloc] initWithFrame:NSMakeRect(0, 306 - i * 27, 475, 24)]; [button setButtonType:NSButtonTypeSwitch]; button.title = titles[i]; button.preference = keys[i]; button.state = [_snapshot[@"preferences"][keys[i]] boolValue] ? NSControlStateValueOn : NSControlStateValueOff; button.target = self; button.action = @selector(preferenceChanged:); [_settingsBody addSubview:button];
    }
    [_settingsBody addSubview:label(@"Menu-bar layout", NSMakeRect(0, 83, 150, 22), 12)];
    NSPopUpButton *layout = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(152, 80, 320, 27) pullsDown:NO]; [layout addItemsWithTitles:@[@"One icon · all workspaces", @"Separate workspace icons"]]; [layout selectItemAtIndex:[_snapshot[@"preferences"][@"menuBarLayout"] isEqual:@"separate"] ? 1 : 0]; layout.accessibilityLabel = @"Menu bar layout"; layout.target = self; layout.action = @selector(layoutChanged:); [_settingsBody addSubview:layout];
    NSTextField *note = label(@"macOS can silence banners during Focus or screen sharing.", NSMakeRect(0, 43, 480, 18), 11); note.textColor = NSColor.secondaryLabelColor; [_settingsBody addSubview:note];
    NSTextField *background = label(@"Closing the main window keeps calls and alerts running.", NSMakeRect(0, 17, 480, 18), 11); background.textColor = NSColor.secondaryLabelColor; [_settingsBody addSubview:background];
  } else if (sender.selectedSegment == 1) {
    [_settingsBody addSubview:label(@"Microphone", NSMakeRect(0, 300, 480, 22), 14)];
    _microphone = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(0, 263, 350, 28) pullsDown:NO]; _microphone.accessibilityLabel = @"Microphone for all workspaces"; _microphone.target = self; _microphone.action = @selector(microphoneChanged:); [_settingsBody addSubview:_microphone];
    _audioRefresh = [self button:@"Refresh" symbol:@"arrow.clockwise" frame:NSMakeRect(360, 263, 110, 28) action:@selector(refreshAudio:) parent:_settingsBody];
    _audioStatus = label(@"", NSMakeRect(0, 220, 478, 32), 11); _audioStatus.textColor = NSColor.secondaryLabelColor; [_settingsBody addSubview:_audioStatus];
    _audioSync = label(@"", NSMakeRect(0, 106, 478, 99), 12); _audioSync.maximumNumberOfLines = 0; _audioSync.lineBreakMode = NSLineBreakByWordWrapping;
    _audioSyncScroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 106, 478, 99)]; _audioSyncScroll.drawsBackground = NO; _audioSyncScroll.hasVerticalScroller = YES; _audioSyncScroll.documentView = _audioSync; [_settingsBody addSubview:_audioSyncScroll];
    _audioMeter = [[NSLevelIndicator alloc] initWithFrame:NSMakeRect(0, 66, 350, 18)]; _audioMeter.levelIndicatorStyle = NSLevelIndicatorStyleContinuousCapacity; _audioMeter.minValue = 0; _audioMeter.maxValue = 1; _audioMeter.warningValue = 1; _audioMeter.criticalValue = 1; _audioMeter.accessibilityLabel = @"Microphone input level"; [_settingsBody addSubview:_audioMeter];
    _audioTest = [self button:@"Test microphone" symbol:@"mic" frame:NSMakeRect(0, 22, 158, 28) action:@selector(testAudio:) parent:_settingsBody];
    [self button:@"Stop test" symbol:@"stop" frame:NSMakeRect(168, 22, 110, 28) action:@selector(stopAudio:) parent:_settingsBody];
    [self refreshAudioSettings];
  } else {
    [_settingsBody addSubview:label(@"Diagnostics", NSMakeRect(0, 300, 480, 22), 14)];
    NSPopUpButton *workspace = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(0, 258, 470, 28) pullsDown:NO]; workspace.accessibilityLabel = @"Diagnostic workspace";
    for (NSDictionary *account in _accounts) { [workspace addItemWithTitle:account[@"name"]]; workspace.lastItem.representedObject = account[@"id"]; if ([account[@"id"] isEqual:_snapshot[@"activeId"]]) [workspace selectItem:workspace.lastItem]; }
    _diagnosticWorkspace = workspace; [_settingsBody addSubview:workspace];
    [self button:@"Test notification" symbol:@"bell" frame:NSMakeRect(0, 206, 168, 28) action:@selector(testNotification:) parent:_settingsBody];
    NSButton *simulate = [self button:@"Simulate incoming call" symbol:@"phone.badge.waveform" frame:NSMakeRect(180, 206, 200, 28) action:@selector(testCall:) parent:_settingsBody];
    simulate.enabled = _accounts.count && [_snapshot[@"preferences"][@"showMenuBar"] boolValue];
    simulate.toolTip = @"Show the menu-bar icon to use the local call simulator.";
    NSTextField *simulation = label(@"Simulation checks local controls. It does not place a phone call.", NSMakeRect(0, 170, 480, 28), 11); simulation.textColor = NSColor.secondaryLabelColor; [_settingsBody addSubview:simulation];
    [self button:@"Connection health…" symbol:@"waveform.path.ecg" frame:NSMakeRect(0, 110, 190, 28) action:@selector(connectionHealth:) parent:_settingsBody];
    NSTextField *note = label(@"Page health cannot establish call delivery or session reliability.\nVerify those with real calls and an extended idle run.", NSMakeRect(0, 48, 478, 46), 11); note.maximumNumberOfLines = 3; note.textColor = NSColor.secondaryLabelColor; [_settingsBody addSubview:note];
  }
}
- (void)preferenceChanged:(SettingsChoice *)sender { [self emit:@{@"type":@"preference", @"key":sender.preference, @"value":@(sender.state == NSControlStateValueOn)}]; }
- (void)layoutChanged:(NSPopUpButton *)sender { [self emit:@{@"type":@"preference", @"key":@"menuBarLayout", @"value":sender.indexOfSelectedItem == 1 ? @"separate" : @"combined"}]; }
- (void)microphoneChanged:(NSPopUpButton *)sender { [self emit:@{@"type":@"audio-preferences", @"audio":@{@"input":sender.selectedItem.representedObject ?: NSNull.null}}]; }
- (void)refreshAudio:(id)sender { [self emit:@{@"type":@"audio-refresh"}]; }
- (void)testAudio:(id)sender { [self emit:@{@"type":@"audio-test"}]; }
- (void)stopAudio:(id)sender { [self emit:@{@"type":@"audio-stop"}]; }
- (void)testNotification:(id)sender { NSString *identifier = _diagnosticWorkspace.selectedItem.representedObject ?: _snapshot[@"activeId"]; if ([identifier isKindOfClass:NSString.class]) [self emit:@{@"type":@"test-notification", @"id":identifier}]; }
- (void)testCall:(id)sender { NSString *identifier = _diagnosticWorkspace.selectedItem.representedObject; if (identifier) [self emit:@{@"type":@"test-call", @"id":identifier}]; }
- (void)connectionHealth:(id)sender { [_settingsWindow orderBack:nil]; [_window makeKeyAndOrderFront:nil]; [self emit:@{@"type":@"health"}]; }
- (void)refreshAudioSettings {
  if (!_microphone) return;
  NSDictionary *active = nil; for (NSDictionary *account in _accounts) if ([account[@"id"] isEqual:_snapshot[@"activeId"]]) active = account;
  NSDictionary *audio = active[@"audio"];
  NSString *selected = [_snapshot[@"audio"][@"input"] isKindOfClass:NSString.class] ? _snapshot[@"audio"][@"input"] : nil;
  NSMutableArray *choices = [NSMutableArray arrayWithObject:@"System Default"]; [choices addObjectsFromArray:audio[@"devices"] ?: @[]];
  if (selected && ![choices containsObject:selected]) [choices addObject:selected];
  if (![_microphone.itemTitles isEqual:choices]) { [_microphone removeAllItems]; for (NSUInteger i = 0; i < choices.count; ++i) { [_microphone addItemWithTitle:choices[i]]; _microphone.lastItem.representedObject = i ? choices[i] : nil; } }
  [_microphone selectItemAtIndex:selected ? [choices indexOfObject:selected] : 0];
  BOOL busy = NO; for (NSDictionary *account in _accounts) if ([account[@"inCall"] boolValue] || [account[@"ringing"] boolValue] || [account[@"audio"][@"capturing"] boolValue]) busy = YES;
  _audioRefresh.enabled = !!active && !busy;
  _audioTest.enabled = !!active && !busy && ![audio[@"testing"] boolValue];
  _audioMeter.doubleValue = [audio[@"level"] doubleValue];
  _audioStatus.stringValue = busy || [audio[@"capturing"] boolValue] ? @"Changes apply to the next capture. An active call keeps its microphone." : @"Applies to every workspace. Refresh briefly requests microphone access.\nThe 10-second input test measures sound locally; nothing is recorded.";
  NSDictionary *labels = @{@"system":@"System Default", @"selected":@"Ready", @"missing":@"Device missing", @"ambiguous":@"Duplicate device name", @"permission":@"Microphone access denied", @"pending":@"Refresh devices to verify", @"error":@"Audio unavailable"};
  NSMutableArray *lines = [NSMutableArray array];
  for (NSDictionary *account in _accounts) { NSDictionary *state = account[@"audio"]; NSString *text = labels[state[@"status"] ?: @"pending"]; [lines addObject:[NSString stringWithFormat:@"%@: %@%@", account[@"name"], text ?: @"Unavailable", [state[@"testing"] boolValue] ? @" · Testing" : @""]]; }
  NSString *text = [lines componentsJoinedByString:@"\n"];
  if (![_audioSync.stringValue isEqual:text]) { _audioSync.frame = NSMakeRect(0, 0, 458, MAX(99, lines.count * 20)); _audioSync.stringValue = text; [_audioSyncScroll.contentView scrollToPoint:NSMakePoint(0, MAX(0, _audioSync.frame.size.height - 99))]; }
}
- (void)windowWillClose:(NSNotification *)notification { if (notification.object == _settingsWindow) { [self emit:@{@"type":@"audio-stop"}]; _settingsWindow.delegate = nil; _settingsWindow = nil; _settingsTabs = nil; _settingsBody = nil; _microphone = nil; _audioStatus = nil; _audioSync = nil; _audioMeter = nil; _audioTest = nil; _audioRefresh = nil; _audioSyncScroll = nil; _diagnosticWorkspace = nil; } }
@end
