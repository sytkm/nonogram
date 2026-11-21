const puzzleQualityWorkerURL = 'puzzle-quality-worker.js?v=line-solvability';

function requestPuzzleQuality(data) {
    let worker;
    let timeout;
    let finish;
    const result = new Promise(resolve => {
        finish = outcome => {
            window.clearTimeout(timeout);
            worker?.terminate();
            worker = undefined;
            resolve(outcome);
        };
        try {
            worker = new Worker(puzzleQualityWorkerURL);
            worker.onmessage = event => finish(event.data);
            worker.onerror = () => finish('unavailable');
            timeout = window.setTimeout(() => finish('inconclusive'), 3000);
            worker.postMessage(data);
        } catch {
            finish('unavailable');
        }
    });
    return { result, cancel: () => finish('cancelled') };
}

function lineSolvabilityMessage(result) {
    const messages = {
        complete: '行・列の推理だけで最後まで確定できました。',
        partial: '行・列の推理だけでは途中で確定できるマスがなくなりました。他の推理で解ける場合があります。',
        inconclusive: '行・列の推理で解けるかは、検査の上限内で判定できませんでした。',
        contradiction: '行・列の推理で、ヒント数字と初期状態の矛盾が見つかりました。',
        unavailable: '行・列の推理の検査を実行できませんでした。',
    };
    return messages[result?.logic ?? result] ?? messages.unavailable;
}

function setupQualityCheck(button, output, readClues, describe = describeUniqueness,
    pending = '答えの数を調べています…') {
    let request;

    function reset() {
        request?.cancel();
        request = undefined;
        button.disabled = false;
        output.textContent = '';
    }

    button.onclick = async () => {
        reset();
        button.disabled = true;
        output.textContent = pending;
        const running = requestPuzzleQuality(readClues());
        request = running;
        const result = await running.result;
        if (request !== running) return;
        reset();
        output.textContent = describe(result);
    };
    return reset;
}

function describeUniqueness(result) {
    const messages = {
        unique: '答えは一つです。',
        multiple: 'ヒント数字を満たす答えが複数あります。',
        inconclusive: 'この問題は検査の上限内で判定できませんでした。',
        none: 'ヒント数字を満たす答えが見つかりませんでした。',
    };
    return messages[result] ?? '検査を実行できませんでした。';
}
