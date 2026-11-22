function setupDialogDismiss(dialog) {
    let outsidePointer;
    let completedOutside = false;

    function outside(event) {
        if (event.target !== dialog) return false;
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom;
    }

    function reset() {
        outsidePointer = undefined;
        completedOutside = false;
    }

    dialog.addEventListener('pointerdown', event => {
        reset();
        if (event.button === 0 && event.isPrimary && outside(event)) {
            outsidePointer = event.pointerId;
        }
    });
    dialog.addEventListener('pointerup', event => {
        completedOutside = outsidePointer === event.pointerId && outside(event);
        outsidePointer = undefined;
    });
    dialog.addEventListener('pointercancel', reset);
    dialog.addEventListener('close', reset);
    dialog.addEventListener('click', event => {
        const dismiss = completedOutside && event.detail > 0 && outside(event);
        reset();
        if (!dialog.open || !dismiss) return;
        // Close on click, not pointerup, so the same click cannot reach the board.
        event.preventDefault();
        event.stopPropagation();
        dialog.close('cancel');
    });
}
