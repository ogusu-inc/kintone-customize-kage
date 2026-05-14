console.log("INJECTOR SCRIPT RUNNING");

window.addEventListener('load', function () {
    'use strict';

    const parentNode = document.body;
    const config = { childList: true, subtree: true };

    let currentType = '';

    /* =========================
       Find field container safely
    ========================= */
    function getFieldRow(fieldCode) {
        return document.querySelector(`[data-field-code="${fieldCode}"]`)
            || document.querySelector(`[data-field-code*="${fieldCode}"]`)
            || null;
    }

    /* =========================
       Bind 種類 field
    ========================= */
    function bindEvent() {
        const typeRow = getFieldRow('種類');
        if (!typeRow) return;

        const typeSelect = typeRow.querySelector('select');
        if (!typeSelect || typeSelect.dataset.bound) return;

        typeSelect.dataset.bound = 'true';

        typeSelect.addEventListener('change', function () {
            currentType = typeSelect.value;

            const sizeRow = getFieldRow('サイズ');
            if (!sizeRow) return;

            const sizeInput = sizeRow.querySelector('input');
            const searchBtn = sizeRow.querySelector('.kb-icon-lookup.kb-search');

            if (!sizeInput || !searchBtn) return;

            if (currentType === 'ジャンパー' || currentType === '防寒ベスト') {
                sizeInput.value = currentType;
                searchBtn.click();
                return;
            }

            if (currentType === '空調服') {
                sizeInput.value = currentType;
                searchBtn.click();
                return;
            }

            sizeInput.value = '';
            searchBtn.click();
        });
    }

    /* =========================
       Filter lookup dialog
    ========================= */
    function filterDialog() {
        if (currentType !== '空調服') return;

        const dialog = document.querySelector('.kb-dialog-container');
        if (!dialog) return;

        const rows = dialog.querySelectorAll('tbody tr');

        rows.forEach(row => {
            const text = row.innerText;

            if (text.includes('ジャンパー') || text.includes('防寒ベスト')) {
                row.style.display = 'none';
                return;
            }

            if (
                text.includes('ファンセット付') ||
                text.includes('ベストのみ') ||
                text.includes('ファンセットのみ')
            ) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /* =========================
       Observe dialog
    ========================= */
    let dialogObserver = null;

    function observeDialog() {
        const dialog = document.querySelector('.kb-dialog-container');
        if (!dialog) return;

        if (dialogObserver) dialogObserver.disconnect();

        dialogObserver = new MutationObserver(filterDialog);

        dialogObserver.observe(dialog, {
            childList: true,
            subtree: true
        });

        filterDialog();
    }

    /* =========================
       Main observer
    ========================= */
    const observer = new MutationObserver(() => {
        bindEvent();

        const dialog = document.querySelector('.kb-dialog-container');
        if (dialog) {
            setTimeout(observeDialog, 100);
        }
    });

    observer.observe(parentNode, config);

    /* =========================
       Initial bind
    ========================= */
    setTimeout(bindEvent, 500);
});
