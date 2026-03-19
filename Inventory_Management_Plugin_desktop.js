(function () {
  'use strict';

  /* ========================================
   * 1. Load plugin configuration
   * ======================================== */
  const CONFIG = kintone.plugin.app.getConfig(kintone.$PLUGIN_ID);

  const API_URL             = CONFIG.apiUrl;
  const PURCHASE_APP_ID     = String(CONFIG.purchaseAppId);
  const INVENTORY_APP_ID    = String(CONFIG.inventoryAppId);
  const STOCK_APP_ID        = String(CONFIG.stockAppId);       // ✅ NEW: App 1307
  const PURCHASE_API_TOKEN  = CONFIG.purchaseApiToken;
  const INVENTORY_API_TOKEN = CONFIG.inventoryApiToken;
  const STOCK_API_TOKEN     = CONFIG.stockApiToken;            // ✅ NEW: App 1307 token
  const STATUS_COMPLETE     = CONFIG.approvedStatus || '完了';

  if (!API_URL || !PURCHASE_APP_ID || !INVENTORY_APP_ID ||
      !PURCHASE_API_TOKEN || !INVENTORY_API_TOKEN) {
    console.error('[Inventory Plugin] Missing plugin configuration');
    return;
  }

  /* ========================================
   * 2. App guard: Only run in Purchase Request app
   * ======================================== */
  const CURRENT_APP_ID = String(kintone.app.getId());
  if (CURRENT_APP_ID !== PURCHASE_APP_ID) {
    console.log('[Inventory Plugin] Not Purchase Request App. Plugin stopped.');
    return;
  }

  /* ========================================
   * 3. Subtable mapping
   * ======================================== */
  const SUBTABLES = [
    {
      table: '作業服',
      name:  '種類',
      size:  'サイズ',
      qty:   '作業服数量'
    },
    {
      table: '安全靴',
      name:  '安全靴品名',
      size:  '安全靴サイズ',
      qty:   '安全靴数量'
    },
    {
      table: '名札・エプロン',
      name:  'その他品名',
      size:  null,
      qty:   'その他数量'
    },
    {
      table: 'その他',
      name:  'リスト外品名',
      size:  'リスト外サイズ',
      qty:   'その他数量_0'
    }
  ];

  /* ========================================
   * 4. Extract correct size from raw value
   * ======================================== */
  function extractSize(rawValue) {
    const SIZES = [
      'S','M','L','2L','3L','4L','5L','F','FREE',
      '21.0cm','22.0cm','23.0cm','23.5cm','24.0cm',
      '24.5cm','25.0cm','25.5cm','26.0cm','26.5cm',
      '27.0cm','27.5cm','28.0cm','28.5cm','29.0cm','30.0cm'
    ];

    if (SIZES.includes(rawValue)) return rawValue;

    const parts = rawValue.trim().split(/\s+/);
    const last  = parts[parts.length - 1];

    if (SIZES.includes(last)) return last;

    return rawValue;
  }

  /* ========================================
   * 5. ✅ NEW: Convert half-width size to full-width
   *    For searching App 1307
   * ======================================== */
  function toFullwidth(size) {
    const map = {
      'S':    'Ｓ',
      'M':    'Ｍ',
      'L':    'Ｌ',
      '2L':   '２Ｌ',
      '3L':   '３Ｌ',
      '4L':   '４Ｌ',
      '5L':   '５Ｌ',
      'F':    'Ｆ',
      'FREE': 'FREE'
    };
    return map[size.toUpperCase()] || size;
  }

  /* ========================================
   * 6. ✅ NEW: Check stock in App 1307 BEFORE approval
   *    Returns Promise resolving to array of
   *    insufficient items (empty = all OK)
   * ======================================== */
function checkStockForItems(items) {

  const checks = items.map(function (item) {

    const fullwidthSize   = toFullwidth(item.size);
    const productFullName = item.itemName + '　' + fullwidthSize;
    const query           = encodeURIComponent('product_name like "' + productFullName + '"');

    return fetch(
      'https://' + location.host + '/k/v1/records.json' +
      '?app=' + STOCK_APP_ID +
      '&query=' + query,
      {
        method: 'GET',
        headers: { 'X-Cybozu-API-Token': STOCK_API_TOKEN }
      }
    )
    .then(function (res) { return res.json(); })
    .then(function (data) {

      /* ----------------------------------
       * NEW LOGIC
       * If product NOT in App 1307 → SKIP
       * ---------------------------------- */
      if (!data.records || data.records.length === 0) {

        console.log(
          '[Inventory Plugin] Product not found in App 1307 → skipping stock check:',
          item.itemName, item.size
        );

        return { insufficient: false }; // ignore
      }

      const currentStock = parseInt(
        data.records[0].quantity_in_stock.value || 0,
        10
      );

      if (currentStock < item.qty) {

        return {
          insufficient: true,
          itemName: item.itemName,
          size: item.size,
          current: currentStock,
          requested: item.qty
        };
      }

      return { insufficient: false };

    });

  });

  return Promise.all(checks).then(function (results) {
    return results.filter(function (r) { return r.insufficient; });
  });

}

  /* ========================================
   * 7. ✅ NEW: Collect all items from subtables
   * ======================================== */
  function collectItems(record) {
    const items = [];

    SUBTABLES.forEach(function (sub) {
      if (!record[sub.table] || !record[sub.table].value.length) return;

      record[sub.table].value.forEach(function (row) {
        const itemName = row.value[sub.name] ? row.value[sub.name].value : '';
        const rawSize  = sub.size
          ? (row.value[sub.size] ? row.value[sub.size].value : 'N/A')
          : 'N/A';
        const size = extractSize(rawSize);
        const qty  = Number(row.value[sub.qty] ? row.value[sub.qty].value : 0);

        if (itemName && qty > 0) {
          items.push({ itemName: itemName, size: size, qty: qty });
        }
      });
    });

    return items;
  }

  /* ========================================
   * 8. Update OR Create record in App 1227
   * ======================================== */
  function updateInventoryApp(itemName, size, newStock, diffQty, employeeName, employeeNo) {
    const query = 'item_name = "' + itemName + '" and size = "' + size + '"';
    console.log('[Inventory Plugin] Searching App 1227:', query);

    fetch('https://' + location.host + '/k/v1/records.json?' +
          'app=' + INVENTORY_APP_ID +
          '&query=' + encodeURIComponent(query) +
          '&fields[]=$id&fields[]=current_stock', {
      method: 'GET',
      headers: {
        'X-Cybozu-API-Token': INVENTORY_API_TOKEN,
        'Content-Type': 'application/json'
      }
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      const now = new Date().toISOString();

      if (data.records && data.records.length > 0) {
        const recordId = data.records[0].$id.value;
        console.log('[Inventory Plugin] Record found → updating ID:', recordId);

        return fetch('https://' + location.host + '/k/v1/record.json', {
          method: 'PUT',
          headers: {
            'X-Cybozu-API-Token': INVENTORY_API_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            app: Number(INVENTORY_APP_ID),
            id:  Number(recordId),
            record: {
              current_stock: { value: String(newStock) },
              指名:          { value: employeeName },
              社員番号:      { value: employeeNo },
              updated_At:    { value: now }
            }
          })
        });

      } else {
        console.log('[Inventory Plugin] No record found → creating new record for:', itemName, size);

        return fetch('https://' + location.host + '/k/v1/record.json', {
          method: 'POST',
          headers: {
            'X-Cybozu-API-Token': INVENTORY_API_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            app: Number(INVENTORY_APP_ID),
            record: {
              item_name:     { value: itemName },
              size:          { value: size },
              current_stock: { value: String(newStock) },
              diff_qty:      { value: String(diffQty) },
              指名:          { value: employeeName },
              社員番号:      { value: employeeNo },
              updated_At:    { value: now }
            }
          })
        });
      }
    })
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (result) {
        console.log('[Inventory Plugin] App 1227 operation success:', result);
      }
    })
    .catch(function (err) {
      console.error('[Inventory Plugin] App 1227 operation failed:', err);
    });
  }

  /* ========================================
   * 9. Send payload to AWS Lambda
   *    ✅ IDEA 1: Show popup if insufficient stock
   * ======================================== */
  function sendToLambda(payload) {
    console.log('[Inventory Plugin] Sending to Lambda:', payload);

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      console.log('[Inventory Plugin] Lambda response:', data);

      if (data.new_stock !== undefined) {
        // ✅ Success
        updateInventoryApp(
          payload.item_name,
          payload.size,
          data.new_stock,
          payload.diff_qty,
          payload.employee_name,
          payload.employee_no
        );

      } else {
        console.warn('[Inventory Plugin] Lambda error response:', data.error || data);

        // ✅ IDEA 1: Safety net popup if insufficient stock slips through
        if (data.error && data.error.includes('Insufficient stock')) {
          alert(
            '【在庫不足 / Insufficient Stock】\n\n' +
            '商品名 / Product  : ' + payload.item_name + '\n' +
            'サイズ / Size     : ' + payload.size + '\n\n' +
            '現在の在庫数 / Current Stock : ' + (data.current_stock || 0) + '\n' +
            '要求数量 / Requested Qty     : ' + (data.requested_qty || 0) + '\n\n' +
            'この商品の在庫が不足しています。\n' +
            'Stock is not available for this item.\n' +
            'Please contact the manager.'
          );
        } else {
          alert(
            '在庫の更新中にエラーが発生しました。\n' +
            'An error occurred while updating inventory.\n\n' +
            (data.error || 'Unknown error')
          );
        }
      }
    })
    .catch(function (err) {
      console.error('[Inventory Plugin] Lambda call failed:', err);
      alert(
        'Lambdaへの接続に失敗しました。\n' +
        'Failed to connect to Lambda.\n\n' +
        err.toString()
      );
    });
  }

  /* ========================================
   * 10. Process ONE purchase record
   * ======================================== */
  function processPurchaseRecord(record) {
    const recordId     = record.$id.value;
    const employeeName = record['氏名']    ? record['氏名'].value    : '';
    const employeeNo   = record['社員番号'] ? record['社員番号'].value : '';

    console.log('[Inventory Plugin] Processing purchase record:', recordId);
    console.log('[Inventory Plugin] Employee:', employeeName, '/', employeeNo);

    SUBTABLES.forEach(function (sub) {
      if (!record[sub.table] || !record[sub.table].value.length) {
        console.log('[Inventory Plugin] Subtable empty, skipping:', sub.table);
        return;
      }

      record[sub.table].value.forEach(function (row) {
        const itemName = row.value[sub.name] ? row.value[sub.name].value : '';
        const rawSize  = sub.size
          ? (row.value[sub.size] ? row.value[sub.size].value : 'N/A')
          : 'N/A';
        const size = extractSize(rawSize);
        const qty  = Number(row.value[sub.qty] ? row.value[sub.qty].value : 0);

        if (!itemName || qty <= 0) {
          console.log('[Inventory Plugin] Skipping empty row in:', sub.table);
          return;
        }

        console.log('[Inventory Plugin] Item:', itemName,
                    '| Raw size:', rawSize,
                    '| Extracted size:', size,
                    '| Qty:', qty);

        const payload = {
          source_app_id:      PURCHASE_APP_ID,
          inventory_app_id:   INVENTORY_APP_ID,
          purchase_record_id: recordId,
          item_name:          itemName,
          size:               size,
          diff_qty:           -qty,
          event_type:         'outbound',
          employee_name:      employeeName,
          employee_no:        employeeNo,
          updated_at:         new Date().toISOString()
        };

        sendToLambda(payload);
      });
    });
  }

  /* ========================================
   * 11. Listen for process status change → 完了
   *     ✅ IDEA 2: Check stock BEFORE approval
   * ======================================== */
  kintone.events.on('app.record.detail.process.proceed', function (event) {
    const record     = event.record;
    const nextStatus = event.nextStatus.value;

    console.log('[Inventory Plugin] Process proceeded. Next status:', nextStatus);

    if (nextStatus !== STATUS_COMPLETE) {
      console.log('[Inventory Plugin] Status not 完了, skipping:', nextStatus);
      return event;
    }

    // ✅ IDEA 2: Pre-check stock BEFORE processing
    const items = collectItems(record);

    if (items.length === 0) {
      // No items to check — proceed normally
      processPurchaseRecord(record);
      return event;
    }

    // Return Promise to BLOCK status change until check is done
    return checkStockForItems(items).then(function (insufficientItems) {

      if (insufficientItems.length > 0) {
        // ✅ Stock insufficient → Show popup and BLOCK approval
        let message =
          '【在庫不足 / Insufficient Stock】\n\n' +
          '以下の商品は在庫が不足しているため、承認できません。\n' +
          'The following items have insufficient stock.\n' +
          'Approval cannot proceed.\n\n';

        insufficientItems.forEach(function (item) {
          message +=
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '商品名 / Product  : ' + item.itemName + '\n' +
            'サイズ / Size     : ' + item.size + '\n' +
            '現在の在庫 / Current Stock : ' + item.current + '\n' +
            '要求数量 / Requested Qty   : ' + item.requested + '\n';
        });

        message +=
          '━━━━━━━━━━━━━━━━━━━━\n\n' +
          '担当者にご連絡ください。\n' +
          'Please contact the manager.';

        alert(message);

        // ✅ Throw error to BLOCK the status change
        event.error =
          '在庫不足のため承認できません。 / Cannot approve due to insufficient stock.';
        return event;

      } else {
        // ✅ All stock OK → proceed with Lambda
        console.log('[Inventory Plugin] Stock check passed → processing inventory');
        processPurchaseRecord(record);
        return event;
      }
    });
  });

})();