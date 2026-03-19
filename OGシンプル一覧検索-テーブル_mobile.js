(function (PLUGIN_ID) {
  'use strict';

  var config = kintone.plugin.app.getConfig(PLUGIN_ID);

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
      { app: kintone.mobile.app.getId() }
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
      console.log('[MobileSimpleSearch] View Filter:', filter);
      console.log('[MobileSimpleSearch] View Fields:', viewFields);
      callback(filter, viewFields);
    }).catch(function (err) {
      console.error('[MobileSimpleSearch] View Filter Error:', err);
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
      { app: kintone.mobile.app.getId() }
    ).then(function (resp) {
      fieldInfoCache = resp.properties;
      callback(fieldInfoCache);
    }).catch(function (err) {
      console.error('[MobileSimpleSearch] Field Info Error:', err);
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
          console.warn('[MobileSimpleSearch] Subtable not found:', tableCode);
          return;
        }

        var subFieldInfo = tableInfo.fields[subCode];
        if (!subFieldInfo) {
          console.warn('[MobileSimpleSearch] Sub-field not found:', subCode, 'in', tableCode);
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
        console.warn('[MobileSimpleSearch] Field not found:', code);
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

    console.log('[MobileSimpleSearch] Searchable fields:', Object.keys(searchableFieldList).length);
  }

  // ─────────────────────────────────────────────────────────────
  // Filter searchable fields against what the current view shows.
  //
  // KEY FIX for mobile:
  // Mobile views often do NOT list subtable parent codes in view.fields.
  // So we ALWAYS include subtable fields regardless of view field list.
  // Only normal top-level fields are filtered by view visibility.
  // ─────────────────────────────────────────────────────────────
  function filterFieldsByView() {
    if (currentViewFields.length === 0) {
      return searchableFieldList;
    }

    var filteredFields = {};
    Object.keys(searchableFieldList).forEach(function (fieldCode) {
      var fieldData = searchableFieldList[fieldCode];

      if (fieldData.isTableField) {
        // ✅ FIX: Always include subtable fields on mobile.
        // Mobile views rarely list subtable parent codes in view.fields,
        // which caused all subtable fields to be filtered out → 0 results.
        filteredFields[fieldCode] = fieldData;
      } else {
        // Normal top-level fields → check view visibility as usual
        if (currentViewFields.indexOf(fieldCode) !== -1) {
          filteredFields[fieldCode] = fieldData;
        }
      }
    });

    console.log('[MobileSimpleSearch] View-filtered fields:', Object.keys(filteredFields).length);
    return filteredFields;
  }

  // ─────────────────────────────────────────────────────────────
  // Orchestrate field info fetch → expansion
  // ─────────────────────────────────────────────────────────────
  function initializeSearch() {
    getFieldInfo(function () {
      expandSearchableFields();
      recordsLoaded = true;
      console.log('[MobileSimpleSearch] Initialized. Ready to search.');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Subtable text types → handled client-side
  // Subtable types that cannot be searched → skip entirely
  // ─────────────────────────────────────────────────────────────
  var SUBTABLE_TEXT_TYPES = [
    'SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT', 'LINK'
  ];

  var UNSEARCHABLE_IN_SUBTABLE = [
    'CALC', 'DATE', 'DATETIME', 'TIME',
    'CREATED_TIME', 'UPDATED_TIME', 'FILE', 'NUMBER', 'RECORD_NUMBER'
  ];

  // ─────────────────────────────────────────────────────────────
  // Build SERVER-SIDE query for top-level + subtable selection fields.
  // Subtable text fields are excluded here — handled client-side.
  // Returns: { query, hasSubtableText, subtableTextFields }
  // ─────────────────────────────────────────────────────────────
  function buildServerQuery(searchText, availableFields) {
    var searchTrimmed = searchText.trim();
    var searchEscaped = searchTrimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var searchLower   = searchTrimmed.toLowerCase();
    var fieldQueries  = [];
    var subtableTextFields = [];

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
        if (SUBTABLE_TEXT_TYPES.indexOf(fieldInfo.type) !== -1) {
          subtableTextFields.push(fieldData);
          return;
        }
        if (UNSEARCHABLE_IN_SUBTABLE.indexOf(fieldInfo.type) !== -1) return;

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
        console.error('[MobileSimpleSearch] Query build error:', fieldCode, err);
      }
    });

    return {
      query:              fieldQueries.length > 0 ? '(' + fieldQueries.join(' or ') + ')' : '',
      hasSubtableText:    subtableTextFields.length > 0,
      subtableTextFields: subtableTextFields
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CLIENT-SIDE: Check if a single record matches subtable text search.
  // ─────────────────────────────────────────────────────────────
  function recordMatchesSubtableText(record, subtableTextFields, searchLower) {
    for (var i = 0; i < subtableTextFields.length; i++) {
      var fieldData = subtableTextFields[i];
      var tableCode = fieldData.parentTable;
      var subCode   = fieldData.subFieldCode;

      var tableField = record[tableCode];
      if (!tableField || !tableField.value) continue;

      var rows = tableField.value;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r].value;
        if (!row || !row[subCode]) continue;
        var cellVal = row[subCode].value || '';
        if (cellVal.toLowerCase().indexOf(searchLower) !== -1) {
          return true;
        }
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // Fetch ALL records matching server query, then filter client-side.
  // ─────────────────────────────────────────────────────────────
  function fetchAndFilterRecords(serverQuery, subtableTextFields, searchLower, callback) {
    var allRecords = [];
    var limit      = 500;

    var fieldsToFetch = ['$id'];
    subtableTextFields.forEach(function (f) {
      if (fieldsToFetch.indexOf(f.parentTable) === -1) {
        fieldsToFetch.push(f.parentTable);
      }
    });

    function fetchPage(offset) {
      var params = {
        app:    kintone.mobile.app.getId(),
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
          var matched = allRecords.filter(function (record) {
            return recordMatchesSubtableText(record, subtableTextFields, searchLower);
          });
          console.log('[MobileSimpleSearch] Client-side matched:', matched.length, '/', allRecords.length);
          callback(matched);
        }
      }).catch(function (err) {
        console.error('[MobileSimpleSearch] Fetch records error:', err);
        callback([]);
      });
    }

    fetchPage(0);
  }

  // ─────────────────────────────────────────────────────────────
  // Navigate to list view with the composed query
  // ─────────────────────────────────────────────────────────────
  function reload(query, text) {
    var appId  = kintone.mobile.app.getId();
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

    console.log('[MobileSimpleSearch] Reload URL:', url);
    window.location.href = url;
  }

  // ─────────────────────────────────────────────────────────────
  // Validate input, build query, trigger reload — HYBRID STRATEGY
  // ─────────────────────────────────────────────────────────────
  function performSearch() {
    var input = document.querySelector('#mobile-list-search-wrapper input');
    var text  = input.value.trim();

    if (!text) {
      currentSearchText = '';
      sessionStorage.removeItem('kintone_mobile_searchText');
      reload(viewFilterQuery, '');
      return;
    }

    if (text.length < MIN_LENGTH) {
      alert('最低' + MIN_LENGTH + '文字を入力してください。\nPlease enter at least ' + MIN_LENGTH + ' characters.');
      return;
    }

    if (!recordsLoaded || Object.keys(fieldInfoCache).length === 0) {
      alert('検索を初期化中です。お待ちください...\nInitializing search, please wait...');
      return;
    }

    var availableFields = filterFieldsByView();
    if (Object.keys(availableFields).length === 0) {
      alert('設定されたフィールドを検索する権限がありません。管理者にお問い合わせください。\nNo permission to search configured fields.');
      return;
    }

    currentSearchText = text;
    sessionStorage.setItem('kintone_mobile_searchText', text);

    var searchLower = text.trim().toLowerCase();
    var result      = buildServerQuery(text, availableFields);

    console.log('[MobileSimpleSearch] Server query:', result.query);
    console.log('[MobileSimpleSearch] Has subtable text fields:', result.hasSubtableText);

    // ── Case 1: No subtable text fields → pure server-side ───
    if (!result.hasSubtableText) {
      if (!result.query) {
        alert('検索可能なフィールドがありません。\nNo searchable fields available.');
        return;
      }
      var finalQuery = viewFilterQuery
        ? '(' + viewFilterQuery + ') and (' + result.query + ')'
        : result.query;
      console.log('[MobileSimpleSearch] Final Query (server-only):', finalQuery);
      reload(finalQuery, text);
      return;
    }

    // ── Case 2: Has subtable text fields → hybrid approach ───
    var baseQuery = viewFilterQuery ? '(' + viewFilterQuery + ')' : '';
    console.log('[MobileSimpleSearch] Fetching records for client-side subtable filter...');

    var input2          = document.querySelector('#mobile-list-search-wrapper input');
    var origPlaceholder = input2.placeholder;
    input2.placeholder  = '検索中... / Searching...';
    input2.disabled     = true;

    fetchAndFilterRecords(
      baseQuery,
      result.subtableTextFields,
      searchLower,
      function (matchedBySubtable) {

        input2.placeholder = origPlaceholder;
        input2.disabled    = false;

        var subtableMatchIds = matchedBySubtable.map(function (r) { return r.$id.value; });
        var finalQuery = '';

        if (result.query && subtableMatchIds.length > 0) {
          var idQuery  = '$id in (' + subtableMatchIds.join(',') + ')';
          var combined = '(' + result.query + ' or ' + idQuery + ')';
          finalQuery   = viewFilterQuery ? '(' + viewFilterQuery + ') and ' + combined : combined;

        } else if (result.query) {
          finalQuery = viewFilterQuery
            ? '(' + viewFilterQuery + ') and (' + result.query + ')'
            : result.query;

        } else if (subtableMatchIds.length > 0) {
          var idQuery2 = '$id in (' + subtableMatchIds.join(',') + ')';
          finalQuery   = viewFilterQuery
            ? '(' + viewFilterQuery + ') and (' + idQuery2 + ')'
            : idQuery2;

        } else {
          alert('検索結果が見つかりませんでした。\nNo results found.');
          return;
        }

        console.log('[MobileSimpleSearch] Final Query (hybrid):', finalQuery);
        reload(finalQuery, text);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Main entry point
  // ─────────────────────────────────────────────────────────────
  kintone.events.on('mobile.app.record.index.show', function (event) {
    if (!searchFields.length) return event;

    var currentViewId = event.viewId;

    if (document.getElementById('mobile-list-search-wrapper')) {
      recordsLoaded = false;
      getViewFilter(currentViewId, function (filter, viewFields) {
        viewFilterQuery   = filter;
        currentViewFields = viewFields;
        initializeSearch();
      });
      return event;
    }

    var space = kintone.mobile.app.getHeaderSpaceElement();
    if (!space) return event;

    var wrapper = document.createElement('div');
    wrapper.id            = 'mobile-list-search-wrapper';
    wrapper.style.cssText = 'padding:10px;background:#f5f5f5;border-bottom:1px solid #d1d1d1;';

    var inputContainer = document.createElement('div');
    inputContainer.style.cssText = 'position:relative;display:flex;align-items:center;';

    var input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = placeholderText;
    input.style.cssText =
      'width:100%;padding:12px 80px 12px 12px;font-size:16px;' +
      'border:1px solid #d1d1d1;border-radius:4px;' +
      'box-sizing:border-box;background:#fff;outline:none;';

    var clearBtn = document.createElement('button');
    clearBtn.textContent   = '✕';
    clearBtn.title         = 'Clear';
    clearBtn.style.cssText =
      'position:absolute;right:45px;width:30px;height:30px;' +
      'border:none;background:none;font-size:18px;color:#999;' +
      'cursor:pointer;display:none;padding:0;';

    var searchBtn = document.createElement('button');
    searchBtn.title     = 'Search';
    searchBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#666" width="24" height="24">' +
      '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 10' +
      '9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z' +
      'M9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
    searchBtn.style.cssText =
      'position:absolute;right:10px;width:30px;height:30px;' +
      'border:none;background:none;cursor:pointer;padding:0;' +
      'display:flex;align-items:center;justify-content:center;';

    inputContainer.appendChild(input);
    inputContainer.appendChild(clearBtn);
    inputContainer.appendChild(searchBtn);
    wrapper.appendChild(inputContainer);
    space.appendChild(wrapper);

    getViewFilter(currentViewId, function (filter, viewFields) {
      viewFilterQuery   = filter;
      currentViewFields = viewFields;
      initializeSearch();
    });

    searchBtn.addEventListener('click', function (e) { e.preventDefault(); performSearch(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); performSearch(); }
    });
    clearBtn.addEventListener('click', function (e) {
      e.preventDefault();
      input.value            = '';
      currentSearchText      = '';
      clearBtn.style.display = 'none';
      sessionStorage.removeItem('kintone_mobile_searchText');
      reload(viewFilterQuery, '');
    });
    input.addEventListener('input', function () {
      clearBtn.style.display = input.value ? 'block' : 'none';
    });

    var restoredFromSession = sessionStorage.getItem('kintone_mobile_searchText');
    var restoredFromURL     = new URLSearchParams(window.location.search).get('searchText');
    var restored            = restoredFromSession || restoredFromURL;
    if (restored) {
      input.value            = restored;
      currentSearchText      = restored;
      clearBtn.style.display = 'block';
    }

    return event;
  });

})(kintone.$PLUGIN_ID);