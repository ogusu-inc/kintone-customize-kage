(function (PLUGIN_ID) {
  'use strict';

  var config = kintone.plugin.app.getConfig(PLUGIN_ID);

  // Parse saved fields — supports:
  //   "fieldCode"            → normal top-level field
  //   "tableCode.subCode"    → specific column inside a subtable
  var searchFields = config.searchFields
    ? config.searchFields.split(',').map(function (f) { return f.trim(); })
    : [];

  var placeholderText   = config.placeholderText || 'シンプル一覧検索';
  var MIN_LENGTH        = 2;

  var recordsLoaded     = false;
  var viewFilterQuery   = '';
  var currentSearchText = '';
  var fieldInfoCache    = {};
  var currentViewFields = [];
  var searchableFieldList = {};

  // ─────────────────────────────────────────────────────────────
  // Fetch the view's filter condition and visible field list
  // ─────────────────────────────────────────────────────────────
  function getViewFilter(viewId, callback) {
    kintone.api(
      kintone.api.url('/k/v1/app/views', true),
      'GET',
      { app: kintone.app.getId() }
    ).then(function (resp) {
      var filter = '';
      var viewFields = [];
      for (var viewName in resp.views) {
        var view = resp.views[viewName];
        if (String(view.id) === String(viewId)) {
          if (view.type === 'LIST') {
            filter     = view.filterCond || '';
            viewFields = view.fields     || [];
          }
          break;
        }
      }
      console.log('[SimpleSearch] View Filter:', filter);
      console.log('[SimpleSearch] View Fields:', viewFields);
      callback(filter, viewFields);
    }).catch(function (err) {
      console.error('[SimpleSearch] View Filter Error:', err);
      callback('', []);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Fetch and cache all form field definitions
  // ─────────────────────────────────────────────────────────────
  function getFieldInfo(callback) {
    if (Object.keys(fieldInfoCache).length > 0) {
      callback(fieldInfoCache);
      return;
    }
    kintone.api(
      kintone.api.url('/k/v1/app/form/fields', true),
      'GET',
      { app: kintone.app.getId() }
    ).then(function (resp) {
      fieldInfoCache = resp.properties;
      callback(fieldInfoCache);
    }).catch(function (err) {
      console.error('[SimpleSearch] Field Info Error:', err);
      callback({});
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Build searchableFieldList from configured searchFields.
  // ─────────────────────────────────────────────────────────────
  function expandSearchableFields() {
    searchableFieldList = {};

    searchFields.forEach(function (code) {

      if (code.indexOf('.') !== -1) {
        var parts     = code.split('.');
        var tableCode = parts[0];
        var subCode   = parts[1];

        var tableInfo = fieldInfoCache[tableCode];
        if (!tableInfo || tableInfo.type !== 'SUBTABLE' || !tableInfo.fields) {
          console.warn('[SimpleSearch] Subtable not found:', tableCode);
          return;
        }

        var subFieldInfo = tableInfo.fields[subCode];
        if (!subFieldInfo) {
          console.warn('[SimpleSearch] Sub-field not found:', subCode, 'in', tableCode);
          return;
        }

        searchableFieldList[code] = {
          info:         subFieldInfo,
          parentTable:  tableCode,
          subFieldCode: subCode,
          isTableField: true
        };
        return;
      }

      var fieldInfo = fieldInfoCache[code];
      if (!fieldInfo) {
        console.warn('[SimpleSearch] Field not found:', code);
        return;
      }

      if (fieldInfo.type === 'SUBTABLE' && fieldInfo.fields) {
        Object.keys(fieldInfo.fields).forEach(function (subFieldCode) {
          var subField = fieldInfo.fields[subFieldCode];
          searchableFieldList[code + '.' + subFieldCode] = {
            info:         subField,
            parentTable:  code,
            subFieldCode: subFieldCode,
            isTableField: true
          };
        });
        return;
      }

      searchableFieldList[code] = {
        info:         fieldInfo,
        parentTable:  null,
        subFieldCode: null,
        isTableField: false
      };
    });

    console.log('[SimpleSearch] Searchable fields:', Object.keys(searchableFieldList).length);
  }

  // ─────────────────────────────────────────────────────────────
  // Filter searchable fields against what the current view shows.
  // ─────────────────────────────────────────────────────────────
  function filterFieldsByView() {
    if (currentViewFields.length === 0) {
      return searchableFieldList;
    }

    var filteredFields = {};
    Object.keys(searchableFieldList).forEach(function (fieldCode) {
      var fieldData = searchableFieldList[fieldCode];

      if (fieldData.isTableField) {
        if (currentViewFields.indexOf(fieldData.parentTable) !== -1) {
          filteredFields[fieldCode] = fieldData;
        }
      } else {
        if (currentViewFields.indexOf(fieldCode) !== -1) {
          filteredFields[fieldCode] = fieldData;
        }
      }
    });

    console.log('[SimpleSearch] View-filtered fields:', Object.keys(filteredFields).length);
    return filteredFields;
  }

  // ─────────────────────────────────────────────────────────────
  // Orchestrate field info fetch → expansion
  // ─────────────────────────────────────────────────────────────
  function initializeSearch() {
    getFieldInfo(function () {
      expandSearchableFields();
      recordsLoaded = true;
      console.log('[SimpleSearch] Initialized. Ready to search.');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Subtable text types — cannot be queried via kintone API
  // and "text" pseudo-field is not available in this app.
  // → These are handled by client-side filtering (fetchAndFilter).
  // ─────────────────────────────────────────────────────────────
  var SUBTABLE_TEXT_TYPES = [
    'SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT', 'LINK'
  ];

  // Subtable types that cannot be searched at all (skip entirely)
  var UNSEARCHABLE_IN_SUBTABLE = [
    'CALC', 'DATE', 'DATETIME', 'TIME',
    'CREATED_TIME', 'UPDATED_TIME', 'FILE', 'NUMBER', 'RECORD_NUMBER'
  ];

  // ─────────────────────────────────────────────────────────────
  // Build SERVER-SIDE query for top-level + subtable selection fields.
  // Subtable text fields are excluded here — handled client-side.
  // Returns: { query: string, hasSubtableText: bool, subtableTextFields: [] }
  // ─────────────────────────────────────────────────────────────
  function buildServerQuery(searchText, availableFields) {
    var searchTrimmed = searchText.trim();
    var searchEscaped = searchTrimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var searchLower   = searchTrimmed.toLowerCase();
    var fieldQueries  = [];
    var subtableTextFields = []; // fields to check client-side

    var excludedTypes = [
      'CREATOR', 'MODIFIER', 'USER_SELECT', 'ORGANIZATION_SELECT',
      'GROUP_SELECT', 'STATUS_ASSIGNEE', 'CATEGORY', 'STATUS',
      'GROUP', 'REFERENCE_TABLE'
    ];

    Object.keys(availableFields).forEach(function (fieldCode) {
      var fieldData = availableFields[fieldCode];
      var fieldInfo = fieldData.info;
      var isTable   = fieldData.isTableField;

      if (excludedTypes.indexOf(fieldInfo.type) !== -1) return;

      if (isTable) {

        // Subtable text → collect for client-side filtering
        if (SUBTABLE_TEXT_TYPES.indexOf(fieldInfo.type) !== -1) {
          subtableTextFields.push(fieldData);
          return;
        }

        // Truly unsupported → skip
        if (UNSEARCHABLE_IN_SUBTABLE.indexOf(fieldInfo.type) !== -1) return;

        // Selection types → in() works in subtables ✅
        var queryFieldCode = fieldData.parentTable + '[].' + fieldData.subFieldCode;
        if (
          fieldInfo.type === 'CHECK_BOX'    ||
          fieldInfo.type === 'MULTI_SELECT' ||
          fieldInfo.type === 'DROP_DOWN'    ||
          fieldInfo.type === 'RADIO_BUTTON'
        ) {
          if (fieldInfo.options) {
            for (var optKey in fieldInfo.options) {
              var optLabel = fieldInfo.options[optKey].label || '';
              if (optLabel.toLowerCase().indexOf(searchLower) !== -1) {
                fieldQueries.push(queryFieldCode + ' in ("' + optLabel + '")');
              }
            }
          }
        }
        return;
      }

      // ── Normal top-level fields ───────────────────────────
      try {
        switch (fieldInfo.type) {
          case 'CALC':
            if (fieldInfo.format === 'NUMBER' || fieldInfo.format === 'NUMBER_DIGIT') {
              if (/^\d+$/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = ' + searchTrimmed);
            } else if (fieldInfo.format === 'DATE') {
              if (/^\d{4}-\d{2}-\d{2}$/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = "' + searchEscaped + '"');
            } else if (fieldInfo.format === 'DATETIME') {
              if (/^\d{4}-\d{2}-\d{2}/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = "' + searchEscaped + '"');
            } else if (fieldInfo.format === 'TIME') {
              if (/^\d{2}:\d{2}/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = "' + searchEscaped + '"');
            } else {
              fieldQueries.push(fieldCode + ' like "' + searchEscaped + '"');
            }
            break;
          case 'NUMBER':
          case 'RECORD_NUMBER':
            if (/^\d+$/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = ' + searchTrimmed);
            break;
          case 'CHECK_BOX':
          case 'MULTI_SELECT':
          case 'DROP_DOWN':
          case 'RADIO_BUTTON':
            if (fieldInfo.options) {
              for (var optKey2 in fieldInfo.options) {
                var optLabel2 = fieldInfo.options[optKey2].label || '';
                if (optLabel2.toLowerCase().indexOf(searchLower) !== -1) {
                  fieldQueries.push(fieldCode + ' in ("' + optLabel2 + '")');
                }
              }
            }
            break;
          case 'DATE':
            if (/^\d{4}-\d{2}-\d{2}$/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = "' + searchEscaped + '"');
            break;
          case 'DATETIME':
          case 'CREATED_TIME':
          case 'UPDATED_TIME':
            if (/^\d{4}-\d{2}-\d{2}/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = "' + searchEscaped + '"');
            break;
          case 'TIME':
            if (/^\d{2}:\d{2}/.test(searchTrimmed)) fieldQueries.push(fieldCode + ' = "' + searchEscaped + '"');
            break;
          default:
            fieldQueries.push(fieldCode + ' like "' + searchEscaped + '"');
            break;
        }
      } catch (err) {
        console.error('[SimpleSearch] Query build error:', fieldCode, err);
      }
    });

    return {
      query:             fieldQueries.length > 0 ? '(' + fieldQueries.join(' or ') + ')' : '',
      hasSubtableText:   subtableTextFields.length > 0,
      subtableTextFields: subtableTextFields
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CLIENT-SIDE: Check if a single record matches subtable text search.
  // Loops through subtable rows and checks each configured text field.
  // ─────────────────────────────────────────────────────────────
  function recordMatchesSubtableText(record, subtableTextFields, searchLower) {
    for (var i = 0; i < subtableTextFields.length; i++) {
      var fieldData  = subtableTextFields[i];
      var tableCode  = fieldData.parentTable;
      var subCode    = fieldData.subFieldCode;

      var tableField = record[tableCode];
      if (!tableField || !tableField.value) continue;

      var rows = tableField.value;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r].value;
        if (!row || !row[subCode]) continue;
        var cellVal = row[subCode].value || '';
        if (cellVal.toLowerCase().indexOf(searchLower) !== -1) {
          return true; // match found
        }
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // Fetch ALL records matching the server query, then filter
  // client-side for subtable text fields.
  // Uses cursor API for large datasets (up to 10,000 records).
  // ─────────────────────────────────────────────────────────────
  function fetchAndFilterRecords(serverQuery, subtableTextFields, searchLower, callback) {
    var allRecords = [];
    var limit      = 500;

    // Build fields to fetch — $id is REQUIRED for final query + subtable parent fields
    var fieldsToFetch = ['$id'];
    subtableTextFields.forEach(function (f) {
      if (fieldsToFetch.indexOf(f.parentTable) === -1) {
        fieldsToFetch.push(f.parentTable);
      }
    });

    // Fetch using offset pagination
    function fetchPage(offset) {
      var params = {
        app:    kintone.app.getId(),
        query:  (serverQuery ? serverQuery + ' ' : '') + 'limit ' + limit + ' offset ' + offset,
        fields: fieldsToFetch
      };

      kintone.api(
        kintone.api.url('/k/v1/records', true),
        'GET',
        params
      ).then(function (resp) {
        allRecords = allRecords.concat(resp.records);
        if (resp.records.length === limit) {
          fetchPage(offset + limit);
        } else {
          // Client-side filter
          var matched = allRecords.filter(function (record) {
            return recordMatchesSubtableText(record, subtableTextFields, searchLower);
          });
          console.log('[SimpleSearch] Client-side matched:', matched.length, '/', allRecords.length);
          callback(matched);
        }
      }).catch(function (err) {
        console.error('[SimpleSearch] Fetch records error:', err);
        callback([]);
      });
    }

    fetchPage(0);
  }

  // ─────────────────────────────────────────────────────────────
  // Navigate to the list view with the composed query
  // ─────────────────────────────────────────────────────────────
  function reload(query, text) {
    var appId  = kintone.app.getId();
    var params = new URLSearchParams(window.location.search);
    var viewId = params.get('view');
    var url    = '/k/' + appId + '/';
    if (viewId) url += '?view=' + viewId;

    if (query && query !== viewFilterQuery) {
      url += (url.indexOf('?') > -1 ? '&' : '?') + 'query=' + encodeURIComponent(query);
    }
    if (text) {
      url += (url.indexOf('?') > -1 ? '&' : '?') + 'searchText=' + encodeURIComponent(text);
    }

    console.log('[SimpleSearch] Reload URL:', url);
    window.location.href = url;
  }

  // ─────────────────────────────────────────────────────────────
  // Validate input, build query, trigger reload
  //
  // HYBRID STRATEGY:
  //   1. Build server-side query for top-level + subtable selection fields
  //   2. If subtable TEXT fields exist:
  //      a. Fetch all records matching server query (or all if no server query)
  //      b. Filter client-side for subtable text match
  //      c. Build record ID query → reload with matched IDs
  //   3. If no subtable text fields → reload directly with server query
  // ─────────────────────────────────────────────────────────────
  function performSearch() {
    var input = document.querySelector('#list-search-wrapper input');
    var text  = input.value.trim();

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

    if (!recordsLoaded || Object.keys(fieldInfoCache).length === 0) {
      alert(
        '検索を初期化中です。お待ちください...\n' +
        'Initializing search, please wait...'
      );
      return;
    }

    var availableFields = filterFieldsByView();
    if (Object.keys(availableFields).length === 0) {
      alert(
        '設定されたフィールドを検索する権限がありません。管理者にお問い合わせください。\n' +
        'No permission to search configured fields. Please contact your administrator.'
      );
      return;
    }

    currentSearchText = text;
    var searchLower   = text.trim().toLowerCase();
    var result        = buildServerQuery(text, availableFields);

    console.log('[SimpleSearch] Server query:', result.query);
    console.log('[SimpleSearch] Has subtable text fields:', result.hasSubtableText);

    // ── Case 1: No subtable text fields → pure server-side ───
    if (!result.hasSubtableText) {
      if (!result.query) {
        alert('検索可能なフィールドがありません。\nNo searchable fields available.');
        return;
      }
      var finalQuery = viewFilterQuery
        ? '(' + viewFilterQuery + ') and (' + result.query + ')'
        : result.query;
      console.log('[SimpleSearch] Final Query (server-only):', finalQuery);
      reload(finalQuery, text);
      return;
    }

    // ── Case 2: Has subtable text fields → hybrid approach ───
    // Fetch ALL records (scoped to viewFilter if present) for client-side filtering.
    // baseQuery is ONLY the view filter — NOT the search term.
    // The search term is applied client-side inside fetchAndFilterRecords.
    var baseQuery = viewFilterQuery ? '(' + viewFilterQuery + ')' : '';

    console.log('[SimpleSearch] Fetching records for client-side subtable filter...');

    // Show loading indicator
    var input2 = document.querySelector('#list-search-wrapper input');
    var origPlaceholder = input2.placeholder;
    input2.placeholder = '検索中... / Searching...';
    input2.disabled    = true;

    fetchAndFilterRecords(
      baseQuery,
      result.subtableTextFields,
      searchLower,
      function (matchedBySubtable) {

        // Restore input
        input2.placeholder = origPlaceholder;
        input2.disabled    = false;

        // Collect record IDs from client-side subtable match
        var subtableMatchIds = matchedBySubtable.map(function (r) {
          return r.$id.value;
        });

        var finalQuery = '';

        if (result.query && subtableMatchIds.length > 0) {
          // Combine: server query OR matched subtable record IDs
          var idQuery = '$id in (' + subtableMatchIds.join(',') + ')';
          var combined = '(' + result.query + ' or ' + idQuery + ')';
          finalQuery = viewFilterQuery
            ? '(' + viewFilterQuery + ') and ' + combined
            : combined;

        } else if (result.query) {
          // Only server query matched (no subtable text matches)
          finalQuery = viewFilterQuery
            ? '(' + viewFilterQuery + ') and (' + result.query + ')'
            : result.query;

        } else if (subtableMatchIds.length > 0) {
          // Only subtable text matched
          var idQuery2 = '$id in (' + subtableMatchIds.join(',') + ')';
          finalQuery = viewFilterQuery
            ? '(' + viewFilterQuery + ') and (' + idQuery2 + ')'
            : idQuery2;

        } else {
          // Nothing matched at all
          alert(
            '検索結果が見つかりませんでした。\n' +
            'No results found.'
          );
          return;
        }

        console.log('[SimpleSearch] Final Query (hybrid):', finalQuery);
        reload(finalQuery, text);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Main entry point
  // ─────────────────────────────────────────────────────────────
  kintone.events.on('app.record.index.show', function (event) {
    if (!searchFields.length) return event;

    var currentViewId = event.viewId;

    // UI already exists — re-init data only
    if (document.getElementById('list-search-wrapper')) {
      recordsLoaded = false;
      getViewFilter(currentViewId, function (filter, viewFields) {
        viewFilterQuery   = filter;
        currentViewFields = viewFields;
        initializeSearch();
      });
      return event;
    }

    var space = kintone.app.getHeaderMenuSpaceElement();
    if (!space) return event;

    // ── Build UI ──────────────────────────────────────────────
    var wrapper = document.createElement('div');
    wrapper.id             = 'list-search-wrapper';
    wrapper.style.display  = 'inline-block';
    wrapper.style.marginLeft = '8px';
    wrapper.style.position = 'relative';

    var input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = placeholderText;
    input.style.cssText = [
      'width:200px', 'height:40px', 'padding:0 70px 0 10px',
      'border:1px solid #d1d1d1', 'border-radius:4px',
      'font-size:13px', 'outline:none', 'background:#fff'
    ].join(';');

    var clearBtn = document.createElement('button');
    clearBtn.textContent   = '✕';
    clearBtn.style.cssText = [
      'position:absolute', 'right:35px', 'top:50%',
      'transform:translateY(-50%)', 'border:none', 'background:none',
      'cursor:pointer', 'font-size:16px', 'color:#999',
      'display:none', 'padding:5px'
    ].join(';');

    var searchBtn = document.createElement('button');
    searchBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#666" width="20" height="20">' +
      '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 ' +
      '3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 ' +
      '9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
    searchBtn.style.cssText = [
      'position:absolute', 'right:5px', 'top:50%',
      'transform:translateY(-50%)', 'border:none', 'background:none',
      'cursor:pointer', 'padding:5px', 'display:flex', 'align-items:center'
    ].join(';');

    wrapper.appendChild(input);
    wrapper.appendChild(clearBtn);
    wrapper.appendChild(searchBtn);
    space.appendChild(wrapper);

    // ── Initialize ────────────────────────────────────────────
    getViewFilter(currentViewId, function (filter, viewFields) {
      viewFilterQuery   = filter;
      currentViewFields = viewFields;
      initializeSearch();
    });

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

    // Restore search text from URL
    var restored = new URLSearchParams(window.location.search).get('searchText');
    if (restored) {
      input.value            = restored;
      clearBtn.style.display = 'block';
    }

    return event;
  });

})(kintone.$PLUGIN_ID);