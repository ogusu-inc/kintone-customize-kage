window.addEventListener('load', function () {
    // 監視対象の親要素を取得
    const parentNode = document.body; // 親要素を監視

    // オプション設定
    const config = { childList: true, subtree: true };

    function addevent(node) {
        var dropdown = node.querySelector('select');
        dropdown.addEventListener('change', () => {
            var selectedValue = node.querySelector('tbody > tr > td > div > div > span').textContent;
            selectedValue = selectedValue.split('（')[0].trim(); // '('の前を取得してトリム
            if (selectedValue === "兼用帽子") {
                selectedValue = "帽子";
            }
            var targetElement = node.querySelector('[field-id="サイズ"] > div > input');
            targetElement.value = selectedValue;

            if (selectedValue){
                // changeイベントを作成して発火
                var changeEvent = new Event('click');
                var searchbutton = node.querySelector('.kb-icon.kb-icon-lookup.kb-search')
                searchbutton.dispatchEvent(changeEvent);
            }
        });
    }

    // オブザーバーインスタンスを生成
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach(mutation => {
            mutation.addedNodes.forEach(elem => {
                if (elem.nodeType === Node.ELEMENT_NODE && elem.querySelector('[field-id="作業服"]')) {
                    var node = elem.querySelector('tr');
                    addevent(node);
                    startObservingTargetElement();
                }
            });
        });
    });

    // 監視を開始
    observer.observe(parentNode, config);

    function startObservingTargetElement() {
        // MutationObserverを設定
        const Observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.innerText.includes("種類")){
                        addevent(node);
                    }
                });
            });
        });
        // Observerを開始
        Observer.observe(parentNode, config);
    }
});
