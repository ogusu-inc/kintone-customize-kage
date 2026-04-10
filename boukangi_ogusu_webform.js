window.addEventListener('load', function () {
    'use strict';

    const parentNode = document.body;
    const config = { childList: true, subtree: true };
    let currentType = '';

    /* =========================
       Bind 種類 change
    ========================= */
    function bindEvent(node) {
        const typeSelect = node.querySelector('[field-id="種類"] select');
        if (!typeSelect || typeSelect.dataset.bound) return;
        typeSelect.dataset.bound = 'true';

        typeSelect.addEventListener('change', function () {
            currentType = typeSelect.value;

            const sizeInput = node.querySelector('[field-id="サイズ"] input');
            const searchBtn = node.querySelector(
                '[field-id="サイズ"] .kb-icon-lookup.kb-search'
            );

            if (!sizeInput || !searchBtn) return;

            // ジャンパー / 防寒ベスト → keyword search
            if (currentType === 'ジャンパー' || currentType === '防寒ベスト') {
                sizeInput.value = currentType;
                searchBtn.click();
                return;
            }

            // 空調服 → open lookup WITHOUT keyword
            if (currentType === '空調服') {
                sizeInput.value = currentType; // ✅ MUST be empty
                searchBtn.click();
                return;
            }

            // Default
            sizeInput.value = '';
            searchBtn.click();
        });
    }

    /* =========================
       空調服 filtering
    ========================= */
    function filterForAirConditionedClothing() {
        if (currentType !== '空調服') return;

        const dialog = document.querySelector('.kb-dialog-container');
        if (!dialog) return;

        const rows = dialog.querySelectorAll('tbody tr');
        if (!rows.length) return;

        rows.forEach(row => {
            const text = row.innerText.trim();

            // Hide ジャンパー & 防寒ベスト
            if (text.startsWith('ジャンパー') || text.startsWith('防寒ベスト')) {
                row.style.display = 'none';
                return;
            }

            // Show only 空調服-related items
            if (
                text.startsWith('ファンセット付') ||
                text.startsWith('ベストのみ') ||
                text.startsWith('ファンセットのみ')
            ) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /* =========================
       Observe lookup dialog
    ========================= */
    let dialogObserver = null;

    function observeLookupDialog() {
        const dialog = document.querySelector('.kb-dialog-container');
        if (!dialog) return;

        if (dialogObserver) dialogObserver.disconnect();

        dialogObserver = new MutationObserver(filterForAirConditionedClothing);

        dialogObserver.observe(dialog, {
            childList: true,
            subtree: true
        });

        filterForAirConditionedClothing();
    }

    /* =========================
       Main observer
    ========================= */
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(elem => {
                if (elem.nodeType !== Node.ELEMENT_NODE) return;

                // Bind 種類
                if (elem.querySelector && elem.querySelector('[field-id="種類"]')) {
                    const row =
                        elem.querySelector('tr') ||
                        elem.closest('tr') ||
                        elem;
                    bindEvent(row);
                }

                // Lookup dialog opened
                if (elem.classList && elem.classList.contains('kb-dialog-container')) {
                    setTimeout(observeLookupDialog, 50);
                }

                // Table body rendered
                if (elem.tagName === 'TBODY') {
                    setTimeout(filterForAirConditionedClothing, 50);
                }
            });
        });
    });

    observer.observe(parentNode, config);

    /* =========================
       Initial bind
    ========================= */
    const existing = document.querySelector('[field-id="種類"] select');
    if (existing) {
        currentType = existing.value;
        bindEvent(
            existing.closest('tr') ||
            existing.closest('div') ||
            document.body
        );
    }
});
