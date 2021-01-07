var feeds = {};

feeds.SETTINGS_API_URL_ = 'https://www.googleapis.com/calendar/v3/users/me/settings';
feeds.CALENDAR_LIST_API_URL_ = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
feeds.CALENDAR_EVENTS_API_URL_ =
    'https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?';

feeds.DAYS_IN_AGENDA_ = 16;
feeds.MAX_DAYS_IN_AGENDA_ = 31;
feeds.events = [];
feeds.nextEvents = [];
feeds.lastFetchedAt = null;
feeds.requestInteractiveAuthToken = function() {
  background.log('feeds.requestInteractiveAuthToken()');
  chrome.identity.getAuthToken({'interactive': true}, function(accessToken) {
    if (chrome.runtime.lastError || !accessToken) {
      background.log('getAuthToken', chrome.runtime.lastError.message);
      return;
    }
    feeds.refreshUI();  // Causes the badge text to be updated.
    feeds.fetchCalendars();
  });
};

feeds.fetchCalendars = function() {
  background.log('feeds.fetchCalendars()');
  chrome.extension.sendMessage({method: 'sync-icon.spinning.start'});

  chrome.storage.local.get(constants.CALENDARS_STORAGE_KEY, function(storage) {
    if (chrome.runtime.lastError) {
      background.log('Error retrieving settings: ', chrome.runtime.lastError.message);
    }

    var storedCalendars = storage[constants.CALENDARS_STORAGE_KEY] || {};
    chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
      if (chrome.runtime.lastError) {
        chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
        feeds.refreshUI();
        return;
      }

      $.ajax(feeds.CALENDAR_LIST_API_URL_, {
        headers: {'Authorization': 'Bearer ' + authToken},
        success: function(data) {
          var calendars = {};
          for (var i = 0; i < data.items.length; i++) {
            var calendar = data.items[i];
            var serverCalendarID = calendar.id;
            var storedCalendar = storedCalendars[serverCalendarID] || {};

            var visible = (typeof storedCalendar.visible !== 'undefined') ? storedCalendar.visible :
                                                                            calendar.selected;

            var mergedCalendar = {
              id: serverCalendarID,
              title: calendar.summary,
              editable: calendar.accessRole == 'writer' || calendar.accessRole == 'owner',
              description: calendar.description || '',
              foregroundColor: calendar.foregroundColor,
              backgroundColor: calendar.backgroundColor,
              visible: visible
            };

            calendars[serverCalendarID] = mergedCalendar;
          }

          var store = {};
          store[constants.CALENDARS_STORAGE_KEY] = calendars;
          chrome.storage.local.set(store, function() {
            if (chrome.runtime.lastError) {
              background.log('Error saving settings: ', chrome.runtime.lastError.message);
              return;
            }
            feeds.fetchEvents();
          });
        },
        error: function(response) {
          chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
          background.log('Fetch Error (Calendars)', response.statusText);
          if (response.status === 401) {
            feeds.refreshUI();
            chrome.identity.removeCachedAuthToken({'token': authToken}, function() {});
          }
        }
      });
    });
  });
};

feeds.fetchEvents = function() {
  background.log('feeds.fetchEvents()');
  chrome.extension.sendMessage({method: 'sync-icon.spinning.start'});

  feeds.lastFetchedAt = new Date();
  background.updateBadge({'title': chrome.i18n.getMessage('fetching_feed')});

  chrome.storage.local.get(constants.CALENDARS_STORAGE_KEY, function(storage) {
    if (chrome.runtime.lastError) {
      background.log('Error retrieving settings:', chrome.runtime.lastError.message);
      return;
    }

    if (!storage[constants.CALENDARS_STORAGE_KEY]) {
      feeds.fetchCalendars();
      return;
    }

    var calendars = storage[constants.CALENDARS_STORAGE_KEY] || {};
    background.log('storage[constants.CALENDARS_STORAGE_KEY]: ', calendars);

    var hiddenCalendars = [];
    var allEvents = [];
    var pendingRequests = 0;
    for (var calendarURL in calendars) {
      var calendar = calendars[calendarURL] || {};
      if (typeof calendar.visible !== 'undefined' && calendar.visible) {
        pendingRequests++;
        feeds.fetchEventsFromCalendar_(calendar, function(events) {
          if (events) {
            allEvents = allEvents.concat(events);
          }

          if (--pendingRequests === 0) {
            allEvents.sort(function(first, second) {
              return first.start - second.start;
            });
            feeds.events = allEvents;
            feeds.refreshUI();
            feeds.updateNotification();
          }
        });
      } else {
        hiddenCalendars.push(calendar.title);
      }
    }
    if (hiddenCalendars.length > 0) {
      background.log('Not showing hidden calendars: ', hiddenCalendars);
    }
  });
};

feeds.fetchEventsFromCalendar_ = function(feed, callback) {
  background.log('feeds.fetchEventsFromCalendar_()', feed.title);

  chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
    if (chrome.runtime.lastError || !authToken) {
      background.log('getAuthToken', chrome.runtime.lastError.message);
      chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
      feeds.refreshUI();
      return;
    }

    var fromDate = moment();
    feeds.fetchEventsRecursively_(feed, callback, authToken, feeds.DAYS_IN_AGENDA_, fromDate);
  });
};

feeds.fetchEventsRecursively_ = function(feed, callback, authToken, days, fromDate) {
  var toDate = moment().add('days', days);
  var feedUrl =
      feeds.CALENDAR_EVENTS_API_URL_.replace('{calendarId}', encodeURIComponent(feed.id)) + ([
        'timeMin=' + encodeURIComponent(fromDate.toISOString()),
        'timeMax=' + encodeURIComponent(toDate.toISOString()), 'maxResults=500',
        'orderBy=startTime', 'singleEvents=true'
      ].join('&'));

  $.ajax(feedUrl, {
    headers: {'Authorization': 'Bearer ' + authToken},
    success: (function(feed) {
      return function(data) {
        if (data.items.length == 0) {
          var nextInterval = days + feeds.DAYS_IN_AGENDA_;
          if (nextInterval < feeds.MAX_DAYS_IN_AGENDA_) {
            feeds.fetchEventsRecursively_(feed, callback, authToken, nextInterval, fromDate);
            return;
          }
        }

        background.log('Received events, now parsing.', feed.title);
        var events = [];
        for (var i = 0; i < data.items.length; i++) {
          var eventEntry = data.items[i];
          var start = utils.fromIso8601(eventEntry.start.dateTime || eventEntry.start.date);
          var end = utils.fromIso8601(eventEntry.end.dateTime || eventEntry.end.date);

          var responseStatus = '';
          var comment = '';
          if (eventEntry.attendees) {
            for (var attendeeId in eventEntry.attendees) {
              var attendee = eventEntry.attendees[attendeeId];
              if (attendee.self) {
                responseStatus = attendee.responseStatus;
                comment = attendee.comment;
                break;
              }
            }
          }

          events.push({
            event_id: eventEntry.id,
            reminders: eventEntry.reminders && eventEntry.reminders.overrides ?
                eventEntry.reminders.overrides :
                data.defaultReminders,
            feed: feed,
            title: eventEntry.summary || chrome.i18n.getMessage('event_title_unknown'),
            description: eventEntry.description || '',
            start: start ? start.valueOf() : null,
            end: end ? end.valueOf() : null,
            allday: !end ||
                (start.hours() === 0 && start.minutes() === 0 && end.hours() === 0 &&
                 end.minutes() === 0),
            gcal_url: eventEntry.htmlLink,
            responseStatus: responseStatus,
            comment: comment
          });
        }
        callback(events);
      };
    })(feed),
    error: function(response) {
      chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
      background.log('Fetch Error (Events)', response.statusText);
      if (response.status === 401) {
        feeds.refreshUI();
        chrome.identity.removeCachedAuthToken({'token': authToken}, function() {});
      }
      callback(null);
    }
  });
};

feeds.updateNotification = function() {
  if (!options.get(options.Options.SHOW_NOTIFICATIONS)) {
    return;
  }
  chrome.alarms.clearAll();

  for (var i = 0; i < feeds.events.length; i++) {
    if (feeds.events[i].reminders.length === 0) {
      continue;
    }
    for (var j = 0; j < feeds.events[i].reminders.length; j++) {
      if (feeds.events[i].reminders[j].method !== 'popup') {
        continue;
      }

      var timeUntilReminderMinutes = feeds.events[i].reminders[j].minutes;
      var eventId = {event_id: feeds.events[i].event_id, reminder: timeUntilReminderMinutes};

      var alarmSchedule =
          moment(feeds.events[i].start).subtract(timeUntilReminderMinutes, 'minutes');
      if (alarmSchedule.isBefore(moment())) {
        continue;
      }
      chrome.alarms.create(JSON.stringify(eventId), {when: alarmSchedule.valueOf()});
    }
  }
};

feeds.refreshUI = function() {
  chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
    if (chrome.runtime.lastError || !authToken) {
      background.updateBadge({
        'color': background.BADGE_COLORS.ERROR,
        'text': '×',
        'title': chrome.i18n.getMessage('authorization_required')
      });
      return;
    }
  });

  feeds.removePastEvents_();
  feeds.determineNextEvents_();

  if (feeds.nextEvents.length === 0) {
    background.updateBadge({'text': '', 'title': chrome.i18n.getMessage('no_upcoming_events')});
    return;
  }

  if (options.get(options.Options.BADGE_TEXT_SHOWN)) {
    var nextEvent = feeds.nextEvents[0];
    var badgeText = moment(nextEvent.start).lang('relative-formatter').fromNow();

    background.updateBadge({
      'color': nextEvent.feed.backgroundColor,
      'text': badgeText,
      'title': feeds.getTooltipForEvents_(feeds.nextEvents)
    });
  } else {  // User has chosen not to show a badge, but we still set a tooltip.
    background.updateBadge({'text': '', 'title': feeds.getTooltipForEvents_(feeds.nextEvents)});
  }

  chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
  chrome.extension.sendMessage({method: 'ui.refresh'});
};

feeds.removePastEvents_ = function() {
  if (feeds.events.length === 0) {
    return;
  }

  var futureAndCurrentEvents = [];
  for (var i = 0; i < feeds.events.length; ++i) {
    if (feeds.events[i].end > moment().valueOf()) {
      futureAndCurrentEvents.push(feeds.events[i]);
    }
  }
  feeds.events = futureAndCurrentEvents;

  if (feeds.events.length === 0) {
    feeds.fetchEvents();
  }
};

feeds.determineNextEvents_ = function() {
  if (feeds.events.length === 0) {
    return;
  }

  feeds.nextEvents = [];
  for (var i = 0; i < feeds.events.length; ++i) {
    var event = feeds.events[i];
    if (event.start < moment().valueOf()) {
      continue;
    }
    if (event.responseStatus == constants.EVENT_STATUS_DECLINED) {
      continue;
    }
    if (!options.get(options.Options.TIME_UNTIL_NEXT_INCLUDES_ALL_DAY_EVENTS) && event.allday) {
      continue;
    }

    if (feeds.nextEvents.length === 0) {
      feeds.nextEvents.push(event);
      continue;
    }

    if (event.start == feeds.nextEvents[0].start) {
      feeds.nextEvents.push(event);
    } else {
      break;
    }
  }
};

feeds.getTooltipForEvents_ = function(nextEvents) {
  var tooltipLines = [];
  if (nextEvents.length > 0) {
    var startMoment = moment(nextEvents[0].start);
    tooltipLines.push(startMoment.calendar() + ' (' + startMoment.fromNow() + ')');
  }

  for (var i = 0; i < nextEvents.length; i++) {
    var event = nextEvents[i];
    tooltipLines.push(' • ' + event.title + ' (' + event.feed.title + ')');
  }
  return tooltipLines.join('\n');
};
