var utils = {};

utils.MAX_CHARS_PER_FIELD_ = 300;
utils.processEvent = function(event) {
  if (!event.end) {  // If there's no end time, infer one as best as we can.
    var startMoment = moment(event.start);
    if (startMoment.hours() === 0 && startMoment.minutes() === 0) {
      event.end = startMoment.add('d', 1).valueOf();
    } else {
      event.end = startMoment.add('h', 2).valueOf();
    }
  }

  for (var field in event) {
    if (event.hasOwnProperty(field) && event[field].length > utils.MAX_CHARS_PER_FIELD_) {
      event[field] =
          event[field].replace(/[\s]+/gi, ' ').substring(0, utils.MAX_CHARS_PER_FIELD_ - 2) +
          ' \u2026';
    }
  }

  if (event.address) {
    if (event.location) {
      event.location = event.address + ' (' + event.location + ')';
    } else {
      event.location = event.address;
    }
    delete event.address;
  }

  event.gcal_url = utils.getGCalUrl_(event);

  return event;
};

utils.getGCalUrl_ = function(event) {
  var link = 'https://calendar.google.com/calendar/event?action=TEMPLATE&trp=false&ctext=' +
      encodeURIComponent(event.title);

  if (event.start) {
    link += '&dates=' + moment(event.start).format('YYYYMMDDTHHmmss').replace('T000000', '');
    if (event.end) {
      link += '/' + moment(event.end).format('YYYYMMDDTHHmmss').replace('T000000', '');
    }
  }

  if (event.url) {
    link += '&sprop=' + encodeURIComponent(event.url) +
        '&sprop=name:' + encodeURIComponent(event.title);
  }

  if (event.description || event.url) {
    link += '&details=';

    if (event.description) {
      link += encodeURIComponent(event.description + '\n\n');
    }

    if (event.url) {
      link += chrome.i18n.getMessage('read_more_at_original_url') + encodeURIComponent(event.url);
    }
  }

  return link;
};

utils.fromIso8601 = function(date) {
  if (!date) {
    return null;
  }

  if (typeof date === 'string') {
    date = date.replace('Z', '+00:00');
    return moment(date, [
      'YYYY-MM-DDTHH:mm:ssZZ', 'YYYY-MM-DDTHHmmssZZ', 'YYYYMMDDTHHmmssZZ',
      'YYYY-MM-DDTHH:mm:ss',   'YYYY-MM-DDTHHmmss',   'YYYYMMDDTHHmmss',
      'YYYY-MM-DDTHH:mmZZ',    'YYYY-MM-DDTHHmmZZ',   'YYYYMMDDTHHmmZZ',
      'YYYY-MM-DDTHH:mm',      'YYYY-MM-DDTHHmm',     'YYYYMMDDTHHmm',
      'YYYY-MM-DDTHH',                                'YYYYMMDDTHH',
      'YYYY-MM-DD',                                   'YYYYMMDD'
    ]);
  } else {
    return moment(date);
  }
};
