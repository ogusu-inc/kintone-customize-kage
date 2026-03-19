(function (PLUGIN_ID) {
  'use strict';

  var config = kintone.plugin.app.getConfig(PLUGIN_ID);

  // Parse saved fields — supports:
  //   "fieldCode"            → normal top-level field
  //   "tableCode.subCode"    → specific column inside a subtable
  var searchFields = config.searchFields
    ? config.searchFields.split(',').map(function (f) { return f.trim(); })
    : [];

  var placeholderText = config.placeholderText || '全体検索';
  var MIN_LENGTH    = 2;
  var MAX_QUERY_IDS = 100;

  var allRecords      = [];
  var recordsLoaded   = false;
  var viewFilterQuery = '';
  var currentSearchText = '';

  // ─────────────────────────────────────────────────────────────
  // Fetch the view's filter condition
  // ─────────────────────────────────────────────────────────────
  function getViewFilter(viewId, callback) {
    kintone.api(
      kintone.api.url('/k/v1/app/views', true),
      'GET',
      { app: kintone.app.getId() }
    ).then(function (resp) {
      var filter = '';
      for (var name in resp.views) {
        var view = resp.views[name];
        if (String(view.id) === String(viewId) && view.type === 'LIST') {
          filter = view.filterCond || '';
          break;
        }
      }
      console.log('[GlobalSearch] View Filter:', filter);
      callback(filter);
    }).catch(function (err) {
      console.error('[GlobalSearch] View Filter Error:', err);
      callback('');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Extract searchable text from a single field value.
  // Handles: string, number, array (selections/users), objects.
  // ─────────────────────────────────────────────────────────────
  function extractText(value) {
    if (value === null || value === undefined) return [];

    // Primitive (string, number, boolean)
    if (typeof value !== 'object') {
      var s = String(value).trim();
      return s ? [s.toLowerCase()] : [];
    }

    // Array (checkbox options, user list, etc.)
    if (Array.isArray(value)) {
      var results = [];
      value.forEach(function (item) {
        results = results.concat(extractText(item));
      });
      return results;
    }

    // Plain object (user/org: {code, name}, selection: {value})
    var parts = [];
    if (value.name)  parts.push(String(value.name));
    if (value.code)  parts.push(String(value.code));
    if (value.label) parts.push(String(value.label));
    if (
      parts.length === 0 &&
      value.value !== undefined &&
      typeof value.value !== 'object'
    ) {
      parts.push(String(value.value));
    }
    var joined = parts.join(' ').trim().toLowerCase();
    return joined ? [joined] : [];
  }

  // ─────────────────────────────────────────────────────────────
  // Collect all searchable text from a record.
  // Scoped STRICTLY to configured searchFields.
  //
  // Format 1: "fieldCode"          → top-level field
  // Format 2: "tableCode.subCode"  → specific subtable column
  // ─────────────────────────────────────────────────────────────
  function collectTextsFromRecord(record, fieldCodes) {
    var texts = [];

    fieldCodes.forEach(function (code) {

      // ── Format 2: "tableCode.subFieldCode" ───────────────
      if (code.indexOf('.') !== -1) {
        var parts     = code.split('.');
        var tableCode = parts[0];
        var subCode   = parts[1];

        var tableField = record[tableCode];
        if (!tableField || !Array.isArray(tableField.value)) return;

        tableField.value.forEach(function (row) {
          if (!row || !row.value) return;
          var col = row.value[subCode];
          if (col) texts = texts.concat(extractText(col.value));
        });
        return;
      }

      // ── Format 1: Top-level field ─────────────────────────
      var field = record[code];
      if (!field) return;

      // If somehow a plain SUBTABLE code is passed, search all columns
      if (field.type === 'SUBTABLE' && Array.isArray(field.value)) {
        field.value.forEach(function (row) {
          if (!row || !row.value) return;
          Object.keys(row.value).forEach(function (colCode) {
            var col = row.value[colCode];
            if (col) texts = texts.concat(extractText(col.value));
          });
        });
        return;
      }

      texts = texts.concat(extractText(field.value));
    });

    return texts;
  }

  // ─────────────────────────────────────────────────────────────
  // Fetch ALL records (paginated 500 at a time)
  // ─────────────────────────────────────────────────────────────
  function fetchAllRecords(offset, collected) {
    offset    = offset    || 0;
    collected = collected || [];

    var appId = kintone.app.getId();
    var query = viewFilterQuery
      ? viewFilterQuery + ' limit 500 offset ' + offset
      : 'limit 500 offset ' + offset;

    return kintone.api(
      kintone.api.url('/k/v1/records', true),
      'GET',
      { app: appId, query: query }
    ).then(function (resp) {
      collected = collected.concat(resp.records);
      if (resp.records.length === 500) {
        return fetchAllRecords(offset + 500, collected);
      }
      allRecords    = collected;
      recordsLoaded = true;
      console.log(
        '[GlobalSearch] Records loaded:', allRecords.length,
        '| Search fields:', searchFields
      );
      return collected;
    }).catch(function (err) {
      console.error('[GlobalSearch] fetchAllRecords Error:', err);
      recordsLoaded = true;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Filter records — all space-separated terms must match (AND).
  // ─────────────────────────────────────────────────────────────
  function filterRecords(searchText) {
    if (!recordsLoaded || !searchText) return [];

    var trimmed = searchText.toLowerCase().trim();
    var terms   = trimmed.split(/\s+/).filter(function (t) { return t.length > 0; });

    console.log('[GlobalSearch] Filter terms:', terms, '| Total records:', allRecords.length);

    var matches = allRecords.filter(function (record) {
      return terms.every(function (term) {
        var texts = collectTextsFromRecord(record, searchFields);
        return texts.some(function (text) {
          return text.indexOf(term) !== -1;
        });
      });
    });

    console.log('[GlobalSearch] Matched:', matches.length, 'for "' + searchText + '"');
    return matches;
  }

  // ─────────────────────────────────────────────────────────────
  // Build $id query from matched IDs (chunks of 50)
  // ─────────────────────────────────────────────────────────────
  function buildQueryFromIds(ids) {
    var parts = [];
    for (var i = 0; i < ids.length; i += 50) {
      var chunk = ids.slice(i, i + 50);
      parts.push(
        '(' +
        chunk.map(function (id) { return '$id = "' + id + '"'; }).join(' or ') +
        ')'
      );
    }
    return parts.join(' or ');
  }

  // ─────────────────────────────────────────────────────────────
  // Navigate to list with the composed query
  // ─────────────────────────────────────────────────────────────
  function reload(query, text) {
    var appId  = kintone.app.getId();
    var params = new URLSearchParams(window.location.search);
    var viewId = params.get('view');

    var url = '/k/' + appId + '/';
    if (viewId) url += '?view=' + viewId;

    if (query && query !== viewFilterQuery) {
      url += (url.indexOf('?') > -1 ? '&' : '?') + 'query=' + encodeURIComponent(query);
    }
    if (text) {
      url += (url.indexOf('?') > -1 ? '&' : '?') + 'searchText=' + encodeURIComponent(text);
    }

    console.log('[GlobalSearch] Reload URL:', url);
    window.location.href = url;
  }

  // ─────────────────────────────────────────────────────────────
  // Main entry point
  // ─────────────────────────────────────────────────────────────
  kintone.events.on('app.record.index.show', function (event) {

    if (!searchFields.length) {
      console.error('[GlobalSearch] No search fields configured!');
      return event;
    }

    var currentViewId = event.viewId;

    // UI already exists — reload data only
    if (document.getElementById('global-search-wrapper')) {
      recordsLoaded = false;
      allRecords    = [];
      getViewFilter(currentViewId, function (filter) {
        viewFilterQuery = filter;
        fetchAllRecords();
      });
      return event;
    }

    var space = kintone.app.getHeaderMenuSpaceElement();
    if (!space) return event;

    // ── Build UI ──────────────────────────────────────────────
    var wrapper = document.createElement('div');
    wrapper.id             = 'global-search-wrapper';
    wrapper.style.display  = 'inline-block';
    wrapper.style.marginLeft = '8px';
    wrapper.style.position = 'relative';

    var input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = placeholderText;
    input.style.cssText = [
      'width:220px',
      'height:40px',
      'padding:0 72px 0 12px',
      'border:1px solid #d1d1d1',
      'border-radius:4px',
      'font-size:13px',
      'outline:none',
      'background:#fff',
      'box-sizing:border-box'
    ].join(';');

    // Clear button ✕
    var clearBtn = document.createElement('button');
    clearBtn.textContent = '✕';
    clearBtn.title       = 'Clear';
    clearBtn.style.cssText = [
      'position:absolute',
      'right:36px',
      'top:50%',
      'transform:translateY(-50%)',
      'border:none',
      'background:none',
      'cursor:pointer',
      'font-size:15px',
      'color:#999',
      'display:none',
      'padding:4px'
    ].join(';');

    // Search button 🔍
    var searchBtn = document.createElement('button');
    searchBtn.title     = 'Search';
    searchBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"' +
      ' fill="#666" width="20" height="20">' +
      '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 10' +
      '9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z' +
      'M9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>' +
      '</svg>';
    searchBtn.style.cssText = [
      'position:absolute',
      'right:4px',
      'top:50%',
      'transform:translateY(-50%)',
      'border:none',
      'background:none',
      'cursor:pointer',
      'padding:4px',
      'display:flex',
      'align-items:center'
    ].join(';');

    wrapper.appendChild(input);
    wrapper.appendChild(clearBtn);
    wrapper.appendChild(searchBtn);
    space.appendChild(wrapper);

    // ── Load data ─────────────────────────────────────────────
    getViewFilter(currentViewId, function (filter) {
      viewFilterQuery = filter;
      fetchAllRecords();
    });

    // ── Search logic ──────────────────────────────────────────
    function performSearch() {
      var text = input.value.trim();

      if (!text) {
        currentSearchText = '';
        reload(viewFilterQuery, '');
        return;
      }

      if (text.length < MIN_LENGTH) {
        alert(
          '最低' + MIN_LENGTH + '文字を入力してください。\n' +
          'Please enter at least ' + MIN_LENGTH + ' characters.'
        );
        return;
      }

      if (!recordsLoaded) {
        alert(
          'レコードを読み込んでいます。しばらくお待ちください...\n' +
          'Records are loading, please wait...'
        );
        return;
      }

      currentSearchText = text;
      var matches = filterRecords(text);

      if (matches.length === 0) {
        alert(
          '「' + text + '」に一致するレコードが見つかりませんでした。\n' +
          'No records found matching "' + text + '".'
        );
        return;
      }

      var ids = matches.map(function (r) { return r.$id.value; });

      if (ids.length > MAX_QUERY_IDS) {
        alert(
          ids.length + ' 件のレコードが見つかりました。\n' +
          '表示可能な最大件数: ' + MAX_QUERY_IDS + ' 件\n\n' +
          '検索を絞り込んでください。スペース区切りでAND検索できます。\n\n' +
          'Found ' + ids.length + ' records (max: ' + MAX_QUERY_IDS + ').\n' +
          'Please refine your search. Use spaces for AND logic.'
        );
        return;
      }

      var idQuery    = buildQueryFromIds(ids);
      var finalQuery = viewFilterQuery
        ? '(' + viewFilterQuery + ') and (' + idQuery + ')'
        : '(' + idQuery + ')';

      console.log('[GlobalSearch] Final Query:', finalQuery);
      reload(finalQuery, text);
    }

    // ── Event listeners ───────────────────────────────────────
    searchBtn.addEventListener('click', function (e) {
      e.preventDefault();
      performSearch();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        performSearch();
      }
    });

    clearBtn.addEventListener('click', function (e) {
      e.preventDefault();
      input.value            = '';
      currentSearchText      = '';
      clearBtn.style.display = 'none';
      reload(viewFilterQuery, '');
    });

    input.addEventListener('input', function () {
      clearBtn.style.display = input.value ? 'block' : 'none';
    });

    // Restore search text from URL if navigated back
    var restored = new URLSearchParams(window.location.search).get('searchText');
    if (restored) {
      input.value            = restored;
      clearBtn.style.display = 'block';
    }

    return event;
  });

})(kintone.$PLUGIN_ID);