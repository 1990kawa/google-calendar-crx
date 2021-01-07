function RequestObject() {}
RequestObject.prototype.method = '';
RequestObject.prototype.parameters = {};
RequestObject.prototype.callback = function() {};


function CalendarFeed() {}
CalendarFeed.prototype.title = '';
CalendarFeed.prototype.summary = '';
CalendarFeed.prototype.author = '';
CalendarFeed.prototype.url = '';
CalendarFeed.prototype.backgroundColor = '';
CalendarFeed.prototype.foregroundColor = '';
CalendarFeed.prototype.visible = false;

function CalendarEvent() {}
CalendarEvent.prototype.title = '';
CalendarEvent.prototype.description = '';
CalendarEvent.prototype.start = 0;
CalendarEvent.prototype.end = 0;
CalendarEvent.prototype.url = '';
CalendarEvent.prototype.gcal_url = '';
CalendarEvent.prototype.feed = new CalendarFeed();
