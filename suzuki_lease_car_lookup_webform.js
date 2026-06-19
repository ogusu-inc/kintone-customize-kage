window.addEventListener('load', function () {
    'use strict';

    console.log('[CarColorFilter] v3 window load event fired');
    const TARGET_CAR_TYPES = [
        'ワゴンR',
        'ワゴンRスマイル',
        'ラパン',
        'スペーシア',
        'スペーシアベース',
        'ハスラー（単色）',
        'ハスラー（ツートン）',
        'エブリィ'
    ];
    let lastLoggedCarType = null;
    let lastDialogRowCount = -1;
    let stableCarType = '';
    let pendingCarType = '';
    let pendingSince = 0;
    const STABLE_DELAY_MS = 300;
    function findCarTypeInput() {
        const fieldGuesses = ['車種'];
        for (const id of fieldGuesses) {
            const el = document.querySelector(`[field-id="${id}"] input`);
            if (el) return el;
        }
        const allNodes = document.querySelectorAll('label, span, div, td, th, p');
        for (const node of allNodes) {
            if ((node.textContent || '').trim() === '車種') {
                const container = node.closest('tr') || node.parentElement;
                if (container) {
                    const input = container.querySelector('input');
                    if (input) return input;
                }
            }
        }
        return null;
    }
    function normalize(str) {
        return (str || '')
            .replace(/\u3000/g, ' ')       // full-width space -> normal space
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
            .trim();
    }
    function getRawCarType() {
        const input = findCarTypeInput();
        return input ? input.value : '';
    }
    function getStableCarType() {
        const raw = normalize(getRawCarType());
        const now = Date.now();
        if (raw !== pendingCarType) {
            pendingCarType = raw;
            pendingSince = now;
            return stableCarType; // not stable yet, return last known stable value
        }
        if (now - pendingSince >= STABLE_DELAY_MS) {
            stableCarType = raw;
        }
        return stableCarType;
    }
    function findOpenLookupTable() {
        const selectorsToTry = [
            '.bst-dialog-container tbody tr',
            '.bst-dialog tbody tr',
            '[class*="dialog"] tbody tr',
            '[class*="lookup"] tbody tr',
            '[class*="popup"] tbody tr',
            '[role="dialog"] tbody tr'
        ];
        for (const sel of selectorsToTry) {
            const rows = document.querySelectorAll(sel);
            if (rows.length > 0) {
                return { rows, selectorUsed: sel };
            }
        }
        return { rows: [], selectorUsed: null };
    } 
    function filterForCarColor() {
        const currentCarType = getStableCarType();
        if (currentCarType !== lastLoggedCarType) {
            console.log(
                '[CarColorFilter] stable 車種 value is now:',
                JSON.stringify(currentCarType)
            );
            lastLoggedCarType = currentCarType;
        }
        const { rows, selectorUsed } = findOpenLookupTable();
        if (!rows.length) {
            return; // no dialog open right now
        }
        const dialog = rows[0].closest('.bst-dialog-container');
        if (!currentCarType) {
            rows.forEach(row => {
                row.style.display = '';
            });
            if (dialog) {
                dialog.style.visibility = 'visible';
            }
            return;
        }
        if (!TARGET_CAR_TYPES.includes(currentCarType)) {
            rows.forEach(row => {
                row.style.display = '';
            });
            if (dialog) {
                dialog.style.visibility = 'visible';
            }
            return;
        }
        if (dialog) {
            dialog.style.visibility = 'hidden';
            requestAnimationFrame(() => {
            dialog.style.visibility = 'visible';
        });     
    }
        if (rows.length !== lastDialogRowCount) {
            console.log(
                '[CarColorFilter] dialog table found via selector:',
                selectorUsed,
                '| row count:',
                rows.length
            );
            lastDialogRowCount = rows.length;
        }
        let shown = 0;
        let alreadyFiltered = true;
        const sampleCellTexts = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const guideSpan =
                cells.length
                    ? cells[0].querySelector('.bst-guide')
                    : null;
            const carTypeCellText =
                guideSpan
                    ? normalize(guideSpan.textContent)
                    : normalize(cells.length ? cells[0].textContent : '');
            if (sampleCellTexts.length < 3) {
                sampleCellTexts.push(carTypeCellText);
            }
            const shouldShow = carTypeCellText === currentCarType;
            if (shouldShow) {
                shown++;
            }
            const currentlyHidden = row.style.display === 'none';
            if (shouldShow && currentlyHidden) {
                row.style.display = '';
                alreadyFiltered = false;
            } else if (!shouldShow && !currentlyHidden) {
                row.style.display = 'none';
                alreadyFiltered = false;
            }
        });
        if (dialog) {
            dialog.style.visibility = 'visible';
        }
        if (shown === 0) {
            console.log(
                '[CarColorFilter] WARNING: 0 matches. currentCarType =',
                JSON.stringify(currentCarType),
                '| sample cell texts:',
                sampleCellTexts.map(t => JSON.stringify(t))
            );
        }
        if (!alreadyFiltered) {
            console.log(
                '[CarColorFilter] applied filter: shown',
                shown,
                'of',
                rows.length,
                'rows for',
                currentCarType
            );
        }
    }
    const observer = new MutationObserver(() => {
        filterForCarColor();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('[CarColorFilter] v3 MutationObserver started');
});