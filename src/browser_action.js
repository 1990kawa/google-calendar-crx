let browseraction = {};

browseraction.PATCH_API_URL_ = 'https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}';
browseraction.TOAST_FADE_OUT_DURATION_MS = 5000;
browseraction.SHOW_EVENTS_DELAY_MS = 100;
browseraction.KEY_CODE_ESCAPE = 27;
browseraction.KEY_CODE_CR = 13;
browseraction.KEY_CODE_LF = 10;

browseraction.initialize = function() {
  chrome.extension.getBackgroundPage().background.log('browseraction.initialize()');
  browseraction.fillMessages_();
  browseraction.installButtonClickHandlers_();
  browseraction.installKeydownHandlers_();
  browseraction.showLoginMessageIfNotAuthenticated_();
  browseraction.listenForRequests_();
  chrome.extension.sendMessage({method: 'events.feed.get'}, browseraction.showEventsFromFeed_);
};

browseraction.fillMessages_ = function() {
  moment.lang('en');
  moment.lang(window.navigator.language);
  if (moment.lang() != window.navigator.language) {
    moment.lang(window.navigator.language.substring(0, 2));
  }

  $('.i18n').each(function() {
    let i18nText = chrome.i18n.getMessage($(this).attr('id').toString());
    if (!i18nText) {
      chrome.extension.getBackgroundPage().background.log(
          'Error getting string for: ', $(this).attr('id').toString());
      return;
    }

    if ($(this).prop('tagName') == 'IMG') {
      $(this).attr({'title': i18nText});
    } else {
      $(this).text(i18nText);
    }
  });

  $('[data-href="calendar_ui_url"]').attr('href', constants.CALENDAR_UI_URL);
  $('#quick-add-event-title').attr({
    'placeholder': chrome.i18n.getMessage('event_title_placeholder')
  });
};

/** @private */
browseraction.installButtonClickHandlers_ = function() {
  $('#authorization_required').on('click', function() {
    $('#authorization_required').text(chrome.i18n.getMessage('authorization_in_progress'));
    chrome.extension.sendMessage({method: 'authtoken.update'});
  });

  $('#sync_now').on('click', function() {
    chrome.extension.sendMessage({method: 'events.feed.fetch'}, browseraction.showEventsFromFeed_);
  });

  $('#quick_add_button').on('click', function() {
    browseraction.addNewEventIntoCalendar_();
  });
};


/** @private */
browseraction.installKeydownHandlers_ = function() {
  // Add new event to calendar on pressing `Ctrl + Enter`
  $('#quick-add-event-title').on('keydown', function(e) {
    // Check for Windows and Mac keyboards for event on Ctrl + Enter
    if ((e.ctrlKey || e.metaKey) &&
        (e.keyCode == browseraction.KEY_CODE_CR || e.keyCode == browseraction.KEY_CODE_LF) &&
        $('#quick-add-event-title').val() !== '') {
      // Ctrl-Enter pressed
      browseraction.addNewEventIntoCalendar_();
    }

    // Close quick add box, if empty, on `Esc`
    if (e.keyCode == browseraction.KEY_CODE_ESCAPE) {
      // Prevent popup from closing if quick-add-box is open and has unsaved input
      e.stopPropagation();
      e.preventDefault();
    }
  });

  // Open quick-add-box on pressing `a`
  $(document).on('keypress', function(e) {
    // Do nothing if in an input element
    if ($(e.target).is('input, textarea, select')) {
      return;
    }

  });
};

browseraction.showLoginMessageIfNotAuthenticated_ = function() {
  chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
    if (chrome.runtime.lastError || !authToken) {
      chrome.extension.getBackgroundPage().background.log(
          'getAuthToken', chrome.runtime.lastError.message);
      browseraction.stopSpinnerRightNow();
      $('#error').show();
      $('#action-bar').hide();
      $('#calendar-events').hide();
    } else {
      $('#error').hide();
      $('#action-bar').show();
      $('#calendar-events').show();
    }
  });
};


/**
 * Listens for incoming requests from other pages of this extension and calls
 * the appropriate (local) functions.
 * @private
 */
browseraction.listenForRequests_ = function() {
  chrome.extension.onMessage.addListener(function(request, sender, opt_callback) {
    switch (request.method) {
      case 'ui.refresh':
        chrome.extension.sendMessage(
            {method: 'events.feed.get'}, browseraction.showEventsFromFeed_);
        break;

      case 'sync-icon.spinning.start':
        browseraction.startSpinner();
        break;

      case 'sync-icon.spinning.stop':
        browseraction.stopSpinner();
        break;
    }
  });
};

browseraction.startSpinner = function() {
  $('#sync_now').addClass('spinning');
};

browseraction.stopSpinner = function() {
  $('#sync_now').one('animationiteration webkitAnimationIteration', function() {
    $(this).removeClass('spinning');
  });
};

browseraction.stopSpinnerRightNow = function() {
  $('#sync_now').removeClass('spinning');
};

function showToast(parent, summary, linkUrl) {
  let toastDiv = $('<div>').addClass('alert-new-event event').attr('data-url', linkUrl);
  let toastDetails = $('<div>').addClass('event-details');
  let toastText = $('<div>')
                      .addClass('event-title')
                      .css('white-space', 'normal')
                      .text(chrome.i18n.getMessage('alert_new_event_added') + summary);

  toastDetails.append(toastText);
  toastDiv.append(toastDetails);

  $('.fab').fadeOut();
  parent.prepend(toastDiv).fadeIn();

  $('.alert-new-event').on('click', function() {
    chrome.tabs.create({'url': $(this).attr('data-url')});
  });

  return setTimeout(function() {
    $('.alert-new-event').fadeOut();
    $('.fab').fadeIn();
  }, browseraction.TOAST_FADE_OUT_DURATION_MS);
}

browseraction.updateEventIntoCalendar_ = function(value, event, comment) {
  let patchUrl =
      browseraction.PATCH_API_URL_.replace('{calendarId}', encodeURIComponent(event.feed.id));
  patchUrl = patchUrl.replace('{eventId}', encodeURIComponent(event.event_id))

  chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
    if (chrome.runtime.lastError || !authToken) {
      chrome.extension.getBackgroundPage().background.log(
          'getAuthToken', chrome.runtime.lastError.message);
      return;
    }

    let body = {
      "attendees": [
        {
          "responseStatus": value,
          "email": event.feed.id,
          "comment": comment
        }
      ]
    }

    browseraction.startSpinner();
    $.ajax(patchUrl, {
      type: 'PATCH',
      headers: {'Authorization': 'Bearer ' + authToken},
      data: JSON.stringify(body),
      contentType: 'application/json',
      success: function(response) {
        browseraction.stopSpinner();
        chrome.extension.sendMessage({method: 'events.feed.fetch'});
      },
      error: function(response) {
        browseraction.stopSpinner();
        $('#info_bar').text(chrome.i18n.getMessage('error_update_event')).slideDown();
        window.setTimeout(function() {
          $('#info_bar').slideUp();
        }, constants.INFO_BAR_DISMISS_TIMEOUT_MS);
        chrome.extension.getBackgroundPage().background.log(
            'Error update event', response.statusText);
        if (response.status === 401) {
          chrome.identity.removeCachedAuthToken({'token': authToken}, function() {});
        }
      }
    });
  });
};

browseraction.showEventsFromFeed_ = function(events) {
  chrome.extension.getBackgroundPage().background.log('browseraction.showEventsFromFeed_()');
  $('#calendar-events').empty();

  chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
    if (chrome.runtime.lastError || !authToken) {
      chrome.extension.getBackgroundPage().background.log(
          'getAuthToken', chrome.runtime.lastError.message);
      $('#error').show();
      $('#action-bar').hide();
      $('#calendar-events').hide();
    } else {
      $('#error').hide();
      $('#action-bar').show();
      $('#calendar-events').show();
    }
  });

  let calendarEventsDiv = $('<div>', {id: 'calendar-events'});
  let headerDate = moment().hours(0).minutes(0).seconds(0).millisecond(0);

  let calendarDay =
      $('<div>')
          .addClass('calendar-day')
          .append($('<div>')
                      .addClass('date-header')
                      .text(headerDate.format(chrome.i18n.getMessage('date_format_date_header'))))
          .appendTo(calendarEventsDiv);

  if (events === null || events.length === 0 ||
      moment(events[0].start).diff(headerDate, 'hours') > 23) {
    $('<div>')
        .addClass('no-events-today')
        .append(chrome.i18n.getMessage('no_events_today'))
        .appendTo(calendarDay);
  }

  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    let start = utils.fromIso8601(event.start);
    let end = utils.fromIso8601(event.end);

    let startDate = start.clone().hours(0).minutes(0).seconds(0);
    if (startDate.diff(headerDate, 'hours') > 23) {
      headerDate = startDate;
      calendarDay =
          $('<div>')
              .addClass('calendar-day')
              .append(
                  $('<div>')
                      .addClass('date-header')
                      .text(headerDate.format(chrome.i18n.getMessage('date_format_date_header'))))
              .appendTo(calendarEventsDiv);
    }
    browseraction.createEventDiv_(event).appendTo(calendarDay);
  }

  setTimeout(function() {
    $('#calendar-events').replaceWith(calendarEventsDiv);
  }, browseraction.SHOW_EVENTS_DELAY_MS);
};

browseraction.createEventDiv_ = function(event) {
  let start = utils.fromIso8601(event.start);
  let end = utils.fromIso8601(event.end);
  let now = moment().valueOf();

  let eventDiv = ($('<div>').addClass('event').attr({'data-url': event.gcal_url}));

  if (!start) {
    return eventDiv;
  }

  let isHappeningNow = start.valueOf() < now && end.valueOf() >= now;
  let spansMultipleDays = (end.diff(start, 'seconds') > 86400);
  let isMultiDayEventWithTime = (!event.allday && spansMultipleDays);
  if (event.allday || isMultiDayEventWithTime) {
    eventDiv.addClass('all-day');
  }

  let timeFormat = 'HH:mm';

  let dateTimeFormat;
  if (event.allday) {
    dateTimeFormat = chrome.i18n.getMessage('date_format_event_allday');
  } else if (isMultiDayEventWithTime) {
    dateTimeFormat = chrome.i18n.getMessage('date_format_event_allday') + ' ' + timeFormat;
  } else {
    dateTimeFormat = timeFormat;
  }

  let startTimeDiv = $('<div>').addClass('start-time');
  startTimeDiv.css({'background-color': event.feed.backgroundColor}).attr({
    'title': event.feed.title
  });

  if (!event.allday && !spansMultipleDays) {
    startTimeDiv.text(start.format(dateTimeFormat) + ' ' + end.format(dateTimeFormat));
  }
  startTimeDiv.appendTo(eventDiv);

  let eventDetails = $('<div>').addClass('event-details').appendTo(eventDiv);

  let eventTitle = $('<div>').addClass('event-title');
  $('<a>').attr({'href': event.gcal_url, 'target': '_blank'}).text(event.title).appendTo(eventTitle);

  let response = ""
  switch(event.responseStatus) {
    case 'accepted':
      response = "参加";
      break;
    case 'needsAction':
      response = "未定";
      break;
    case constants.EVENT_STATUS_DECLINED:
      response = "不参加";
      break;
  }
  if (event.responseStatus === "accepted" && event.comment) {
    ["リモート", "remote"].forEach(k => {
      if(event.comment.indexOf(k) >= 0) {
        response = "リモート参加"
      }
    })
  }
  let comment = ""
  let eventRes = $('<div>').addClass('event-res').text("出欠: " + response)
  let eventComment = $('<div>').addClass('event-res').text("メモ: " + (event.comment || ""))
  let status = $('<div>').addClass('event-res').text("ステータス: " + (event.responseStatus === "needsAction" ? "未回答" : "回答済み"))
  if (event.responseStatus == constants.EVENT_STATUS_DECLINED) {
    eventTitle.addClass('declined');
  }
  let buttonList = $('<div>').addClass('event-button-wrap')
  let buttonAccepted = $('<button>').addClass('event-button').text('参加')
  buttonAccepted.on('click', function() {
    if (event.comment) { comment = event.comment.replaceAll('remote ', "") }
    browseraction.updateEventIntoCalendar_('accepted', event, comment)
  })
  let buttonRemote = $('<button>').addClass('event-button').text('リモート参加')
  buttonRemote.on('click', function() {
    if (event.comment) { comment = event.comment.replaceAll('remote ', "") }
    browseraction.updateEventIntoCalendar_('accepted', event, "remote " + comment)
  })
  let buttonDeclined = $('<button>').addClass('event-button').text('不参加')
  buttonDeclined.on('click', function() {
    if (event.comment) { comment = event.comment.replaceAll('remote ', "") }
    browseraction.updateEventIntoCalendar_('declined', event, comment)
  })
  let buttonTentetive = $('<button>').addClass('event-button').text('未定')
  buttonTentetive.on('click', function() {
    if (event.comment) { comment = event.comment.replaceAll('remote ', "") }
    browseraction.updateEventIntoCalendar_('needsAction', event, comment)
  })
  buttonAccepted.appendTo(buttonList)
  buttonRemote.appendTo(buttonList)
  buttonDeclined.appendTo(buttonList)
  buttonTentetive.appendTo(buttonList)
  eventTitle.appendTo(eventDetails);
  eventRes.appendTo(eventDetails);
  eventComment.appendTo(eventDetails);
  status.appendTo(eventDetails);
  buttonList.appendTo(eventDetails);

  if (spansMultipleDays || isMultiDayEventWithTime) {
    $('<div>')
        .addClass('start-and-end-times')
        .append(start.format(dateTimeFormat) + ' — ' + end.format(dateTimeFormat))
        .appendTo(eventDetails);
  }
  return eventDiv;
};

browseraction.goToCalendar_ = function(eventUrl) {
  chrome.tabs.query(
      {
        url: [
          constants.CALENDAR_UI_URL + '*/day*', constants.CALENDAR_UI_URL + '*/week*',
          constants.CALENDAR_UI_URL + '*/month*', constants.CALENDAR_UI_URL + '*/year*',
          constants.CALENDAR_UI_URL + '*/agenda*', constants.CALENDAR_UI_URL + '*/custom*'
        ],
        currentWindow: true
      },
      function(tabs) {
        if (tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, {selected: true, url: eventUrl});
        } else {
          chrome.tabs.create({url: eventUrl});
        }
      });
  return;
};

window.addEventListener('load', function() {
  browseraction.initialize();
}, false);
