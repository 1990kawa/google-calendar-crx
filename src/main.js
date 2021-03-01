let main = {}

main.PATCH_API_URL_ = 'https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}'
main.TOAST_FADE_OUT_DURATION_MS = 3000
main.SHOW_EVENTS_DELAY_MS = 100

main.init = () => {
  moment.lang('ja')
  main.installButtonClickHandlers()
  main.showLoginMessageIfNotAuthenticated()
  main.listenForRequests_()
  chrome.extension.sendMessage({method: 'events.feed.get'}, main.showEventsFromFeed_)
}

main.installButtonClickHandlers = () => {
  $('#authorization_required').on('click', () => {
    $('#authorization_required').text(chrome.i18n.getMessage('authorization_in_progress'))
    chrome.extension.sendMessage({method: 'authtoken.update'})
  })

  $('#sync_now').on('click', () => {
    chrome.extension.sendMessage({method: 'events.feed.fetch'}, main.showEventsFromFeed_)
  })
}

main.showLoginMessageIfNotAuthenticated = () => {
  chrome.identity.getAuthToken({'interactive': true}, authToken => {
    if (chrome.runtime.lastError || !authToken) {
      main.stopSpinnerRightNow()
      $('#error').show()
      $('#action-bar').hide()
      $('#calendar-events').hide()
    } else {
      $('#error').hide()
      $('#action-bar').show()
      $('#calendar-events').show()
    }
  })
}

main.listenForRequests_ = () => {
  chrome.extension.onMessage.addListener((request, sender, opt_callback) => {
    switch (request.method) {
      case 'ui.refresh':
        chrome.extension.sendMessage(
            {method: 'events.feed.get'}, main.showEventsFromFeed_)
        break

      case 'sync-icon.spinning.start':
        main.startSpinner()
        break

      case 'sync-icon.spinning.stop':
        main.stopSpinner()
        break
    }
  })
}

main.startSpinner = () => {
  $('#sync_now').addClass('spinning')
}

main.stopSpinner = () => {
  $('#sync_now').one('animationiteration webkitAnimationIteration', function() {
    $(this).removeClass('spinning')
  })
}

main.stopSpinnerRightNow = () => {
  $('#sync_now').removeClass('spinning')
}

function showToast(parent, summary, linkUrl) {
  let toastDiv = $('<div>').addClass('alert-new-event event').attr('data-url', linkUrl)
  let toastDetails = $('<div>').addClass('event-details')
  let toastText = $('<div>')
                      .addClass('event-title')
                      .css('white-space', 'normal')
                      .text(chrome.i18n.getMessage('alert_new_event_added') + summary)

  toastDetails.append(toastText)
  toastDiv.append(toastDetails)

  $('.fab').fadeOut()
  parent.prepend(toastDiv).fadeIn()

  $('.alert-new-event').on('click', () => {
    chrome.tabs.create({'url': $(this).attr('data-url')})
  })

  return setTimeout(() => {
    $('.alert-new-event').fadeOut()
    $('.fab').fadeIn()
  }, main.TOAST_FADE_OUT_DURATION_MS)
}

main.updateEventIntoCalendar = (value, event, comment) => {
  main.startSpinner()
  let patchUrl = main.PATCH_API_URL_.replace('{calendarId}', encodeURIComponent(event.calendarId))
  patchUrl = patchUrl.replace('{eventId}', encodeURIComponent(event.event_id))

  chrome.identity.getAuthToken({'interactive': false}, authToken => {
    if (chrome.runtime.lastError || !authToken) {
      return
    }

    let body = {
      "attendees": [
        {
          "responseStatus": value,
          "email": event.calendarId,
          "comment": comment
        }
      ]
    }

    axios({
      method: 'patch',
      url: patchUrl,
      headers: {
        'Authorization': 'Bearer ' + authToken,
        'Content-Type': 'application/json'
      },
      data: body
    })
    .then(response => {
        main.stopSpinner()
        chrome.extension.sendMessage({method: 'events.feed.fetch'})
      })
    .catch(response => {
        main.stopSpinner()
        $('#info_bar').text(chrome.i18n.getMessage('error_update_event')).slideDown()
        window.setTimeout(function() {
          $('#info_bar').slideUp()
        }, constants.INFO_BAR_DISMISS_TIMEOUT_MS)
        if (response.status === 401) {
          chrome.identity.removeCachedAuthToken({'token': authToken}, function() {})
        }
      })
  })
}

main.showEventsFromFeed_ = events => {
  $('#calendar-events').empty()
  chrome.identity.getAuthToken({'interactive': false}, authToken => {
    if (chrome.runtime.lastError || !authToken) {
      $('#error').show()
      $('#action-bar').hide()
      $('#calendar-events').hide()
    } else {
      $('#error').hide()
      $('#action-bar').show()
      $('#calendar-events').show()
    }
  })

  let calendarEventsDiv = $('<div>', {id: 'calendar-events'})
  let headerDate = moment().hours(0).minutes(0).seconds(0).millisecond(0)

  let calendarDay =
      $('<div>')
          .addClass('calendar-day')
          .append($('<div>')
                      .addClass('date-header')
                      .text(headerDate.format(chrome.i18n.getMessage('date_format_date_header'))))
          .appendTo(calendarEventsDiv)

  events = events || []
  if (events.length === 0 || moment(events[0].start).diff(headerDate, 'hours') > 23) {
    $('<div>')
        .addClass('no-events-today')
        .append(chrome.i18n.getMessage('no_events_today'))
        .appendTo(calendarDay)
  }

  events.forEach(event => {
    let start = utils.fromIso8601(event.start)
    let end = utils.fromIso8601(event.end)

    let startDate = start.clone().hours(0).minutes(0).seconds(0)
    if (startDate.diff(headerDate, 'hours') > 23) {
      headerDate = startDate
      calendarDay =
          $('<div>')
              .addClass('calendar-day')
              .append(
                  $('<div>')
                      .addClass('date-header')
                      .text(headerDate.format(chrome.i18n.getMessage('date_format_date_header'))))
              .appendTo(calendarEventsDiv)
    }
    main.createEventDiv_(event).appendTo(calendarDay)
  })

  setTimeout(() => {
    $('#calendar-events').replaceWith(calendarEventsDiv)
  }, main.SHOW_EVENTS_DELAY_MS)
}

main.createEventDiv_ = event => {
  let start = utils.fromIso8601(event.start)
  let end = utils.fromIso8601(event.end)
  let now = moment().valueOf()

  let eventDiv = ($('<div>').addClass('event').attr({'data-url': event.gcal_url}))

  if (!start) {
    return eventDiv
  }

  let isHappeningNow = start.valueOf() < now && end.valueOf() >= now
  let spansMultipleDays = (end.diff(start, 'seconds') > 86400)
  let isMultiDayEventWithTime = (!event.allday && spansMultipleDays)
  if (event.allday || isMultiDayEventWithTime) {
    eventDiv.addClass('all-day')
  }

  let timeFormat = 'HH:mm'

  let dateTimeFormat
  let startTimeDiv = $('<div>').addClass('start-time')
  if (event.allday) {
    startTimeDiv.text("終日")
  } else if (isMultiDayEventWithTime) {
    dateTimeFormat = chrome.i18n.getMessage('date_format_event_allday') + ' ' + timeFormat
  } else {
    dateTimeFormat = timeFormat
  }

  if (!event.allday && !spansMultipleDays) {
    startTimeDiv.text(start.format(dateTimeFormat) + ' ~ ' + end.format(dateTimeFormat))
  }
  startTimeDiv.appendTo(eventDiv)

  let eventDetails = $('<div>').addClass('event-details').appendTo(eventDiv)

  let eventTitle = $('<div>').addClass('event-title')
  $('<a>').attr({'href': event.gcal_url, 'target': '_blank'}).text(event.title).appendTo(eventTitle)

  let response = ""
  switch(event.responseStatus) {
    case constants.EVENT_STATUS_ACCEPTED:
      response = "参加"
      break
    case constants.EVENT_STATUS_NEED_ACTION:
      response = "未定"
      break
    case constants.EVENT_STATUS_DECLINED:
      response = "不参加"
      break
  }
  if (event.responseStatus === constants.EVENT_STATUS_ACCEPTED && event.comment) {
    ["リモート", "remote"].forEach(k => {
      if(event.comment.indexOf(k) >= 0) {
        response = "リモート参加"
      }
    })
  }
  let comment = event.comment || ""
  let eventRes = $('<div>').addClass('event-res').text("出欠: " + response)
  let eventComment = $('<div>').addClass('event-res').text("メモ: " + comment)
  if (event.responseStatus == constants.EVENT_STATUS_DECLINED) {
    eventTitle.addClass('declined')
  }
  let buttonList = $('<div>').addClass('event-button-wrap')
  let buttonAccepted = $('<button>').addClass('event-button').text('参加')
  if (event.responseStatus === constants.EVENT_STATUS_ACCEPTED && comment.indexOf('remote') < 0) { 
    buttonAccepted.addClass('event-button-selected')
  }
  buttonAccepted.on('click', () => {
    comment = comment = comment.replaceAll('remote ', "")
    main.updateEventIntoCalendar(constants.EVENT_STATUS_ACCEPTED, event, comment)
  })
  let buttonRemote = $('<button>').addClass('event-button').text('リモート参加')
  if (event.responseStatus === constants.EVENT_STATUS_ACCEPTED && comment.indexOf('remote') >= 0) {
    buttonRemote.addClass('event-button-selected') 
  }
  buttonRemote.on('click', () => {
    comment = comment.replaceAll('remote ', "")
    main.updateEventIntoCalendar(constants.EVENT_STATUS_ACCEPTED, event, "remote " + comment)
  })
  let buttonDeclined = $('<button>').addClass('event-button').text('不参加')
  if (event.responseStatus === constants.EVENT_STATUS_DECLINED) { buttonDeclined.addClass('event-button-selected') }
  buttonDeclined.on('click', () => {
    comment = comment.replaceAll('remote ', "")
    main.updateEventIntoCalendar(constants.EVENT_STATUS_DECLINED, event, comment)
  })
  let buttonTentative = $('<button>').addClass('event-button').text('未定')
  if (event.responseStatus === constants.EVENT_STATUS_TENTATIVE) { buttonTentative.addClass('event-button-selected') }
  buttonTentative.on('click', () => {
    comment.replaceAll('remote ', "")
    main.updateEventIntoCalendar(constants.EVENT_STATUS_TENTATIVE, event, comment)
  })
  buttonAccepted.appendTo(buttonList)
  buttonRemote.appendTo(buttonList)
  buttonDeclined.appendTo(buttonList)
  buttonTentative.appendTo(buttonList)
  eventTitle.appendTo(eventDetails)
  eventRes.appendTo(eventDetails)
  eventComment.appendTo(eventDetails)
  buttonList.appendTo(eventDetails)

  return eventDiv
}

window.addEventListener('load', () => {
  main.init()
}, false)
