var options = {};

options.Options = {
  BADGE_TEXT_SHOWN: 'badge-text-shown',
  DEBUG_ENABLE_LOGS: 'debug-enable-logs',
  SHOW_NOTIFICATIONS: 'show_notifications',
  TIME_UNTIL_NEXT_INCLUDES_ALL_DAY_EVENTS: 'time_until_next_includes_all_day_events'
};

options.DEFAULTS_ = {};
options.DEFAULTS_[options.Options.BADGE_TEXT_SHOWN] = true;
options.DEFAULTS_[options.Options.SHOW_NOTIFICATIONS] = false;
options.OPTION_KEY_PREFIX_ = 'option:';
options.OPTIONS_WIDGET_SELECTOR_ = '.option';

options.get = function(optionKey) {
  var optionValue = window.localStorage[options.OPTION_KEY_PREFIX_ + optionKey];
  if (optionValue) {
    return window.JSON.parse(optionValue);
  }
  return options.DEFAULTS_[optionKey];
};

options.set = function(optionKey, optionValue) {
  window.localStorage[options.OPTION_KEY_PREFIX_ + optionKey] = window.JSON.stringify(optionValue);
  chrome.extension.sendMessage({method: 'options.changed', optionKey: optionKey});
};

options.installAutoSaveHandlers = function() {
  var optionInputs = document.querySelectorAll(options.OPTIONS_WIDGET_SELECTOR_);
  for (var i = 0; i < optionInputs.length; ++i) {
    var option = optionInputs[i];
    var type = option.getAttribute('type');
    if (type == 'checkbox') {
      option.addEventListener('change', function(event) {
        var element = event.target;
        options.set(element.name, element.checked);
      }, false);
    } else {
      /** @this {Element} */
      var handler = function() {
        options.set(this.name, this.value);
      };
      option.addEventListener('change', handler, false);
      if (type == 'number' || type == 'range') {
        option.addEventListener('input', handler, false);
      }
    }
  }
};

options.writeDefaultsToStorage = function() {
  for (var optionKey in options.DEFAULTS_) {
    optionKey = /** @type {options.Options} */ (optionKey);  // For JSCompiler.
    if (!window.localStorage[options.OPTION_KEY_PREFIX_ + optionKey]) {
      options.set(optionKey, options.get(optionKey));
    }
  }
};

options.loadOptionsUIFromSavedState = function() {
  var optionInputs = document.querySelectorAll(options.OPTIONS_WIDGET_SELECTOR_);
  for (var i = 0; i < optionInputs.length; ++i) {
    var option = optionInputs[i];
    var type = option.getAttribute('type');
    var name = option.getAttribute('name');
    var value = options.get(name);
    if (type == 'checkbox') {
      option.checked = value ? 'checked' : '';
    } else {
      if (value !== null) {
        option.value = value;
      }
    }
  }
};

options.loadCalendarList = function() {
  chrome.extension.getBackgroundPage().background.log('options.loadCalendarList()');

  chrome.storage.local.get(constants.CALENDARS_STORAGE_KEY, function(storage) {
    if (chrome.runtime.lastError) {
      chrome.extension.getBackgroundPage().background.log(
          'Error retrieving settings:', chrome.runtime.lastError);
    }

    if (storage[constants.CALENDARS_STORAGE_KEY]) {
      var calendars = storage[constants.CALENDARS_STORAGE_KEY];

      for (var calendarId in calendars) {
        var calendar = calendars[calendarId];
        var calendarListEntry = $('<label>');

        $('<input>')
            .attr({
              'type': 'checkbox',
              'name': calendar.id,
              'checked': calendar.visible,
              'data-color': calendar.backgroundColor
            })
            .addClass('calendar-checkbox')
            .css({
              'outline': 'none',
              'background': calendar.visible ? calendar.backgroundColor : '',
              'border': '1px solid ' + calendar.backgroundColor
            })
            .on('change',
                function() {
                  var checkBox = $(this);
                  checkBox.css(
                      {'background': checkBox.is(':checked') ? checkBox.attr('data-color') : ''});
                  calendars[checkBox.attr('name')].visible = checkBox.is(':checked');
                  var store = {};
                  store[constants.CALENDARS_STORAGE_KEY] = calendars;
                  chrome.storage.local.set(store, function() {
                    if (chrome.runtime.lastError) {
                      chrome.extension.getBackgroundPage().background.log(
                          'Error saving calendar list options.', chrome.runtime.lastError);
                      return;
                    }
                    chrome.extension.sendMessage({method: 'events.feed.fetch'});
                  });
                })
            .appendTo(calendarListEntry);

        $('<span>').text(' ' + calendar.title).appendTo(calendarListEntry);
        calendarListEntry.attr('title', calendar.description);

        calendarListEntry.appendTo($('#calendar-list'));
      }
    }
  });
};

options.fillMessages_ = function() {
  $('.i18n').each(function() {
    var i18nText = chrome.i18n.getMessage($(this).attr('data-msg').toString());
    if ($(this).prop('tagName') == 'IMG') {
      $(this).attr({'title': i18nText});
    } else {
      $(this).text(i18nText);
    }
  });
};

if ($('html').attr('data-context') == 'options-page') {
  options.fillMessages_();
  options.installAutoSaveHandlers();
  options.writeDefaultsToStorage();
  options.loadOptionsUIFromSavedState();
  options.loadCalendarList();
}
