import { TemplateView } from 'hydrogen-view-sdk';
import assert from '../lib/assert.js';

class ModalView extends TemplateView {
  constructor(ContentViewClass, vm) {
    assert(ContentViewClass);
    assert(vm);

    super(vm);
    this._vm = vm;
    this._ContentViewClass = ContentViewClass;
  }

  render(t, vm) {
    const dialog = t.dialog(
      {
        className: {
          ModalView_modal: true,
        },
        onClick: (event) => this.onDialogClicked(event),
        onClose: () => this.onNativeDialogClosed(),
      },
      [
        // We have a `modalInner` element so that it will be the target of clicks when
        // people interact with the content inside the modal. And we can close only when
        // people click on the backdrop where the target will be the `dialog` element
        // itself.
        t.div(
          {
            className: {
              ModalView_modalInner: true,
            },
          },
          [
            t.header({ className: 'ModalView_modalHeader' }, [
              t.h3(vm.title),
              t.form({ method: 'dialog', className: 'ModalView_modalDismissForm' }, [
                t.button(
                  {
                    className: 'ModalView_modalDismissButton',
                  },
                  [
                    t.svg(
                      {
                        width: '16',
                        height: '16',
                        viewBox: '0 0 8 8',
                        fill: 'none',
                        xmlns: 'http://www.w3.org/2000/svg',
                      },
                      [
                        t.path({
                          d: 'M1.33313 1.33313L6.66646 6.66646',
                          stroke: 'currentColor',
                          'stroke-width': '1.5',
                          'stroke-linecap': 'round',
                        }),
                        t.path({
                          d: 'M6.66699 1.33313L1.33366 6.66646',
                          stroke: 'currentColor',
                          'stroke-width': '1.5',
                          'stroke-linecap': 'round',
                        }),
                      ]
                    ),
                  ]
                ),
              ]),
            ]),
            t.view(new this._ContentViewClass(vm.contentViewModel)),
          ]
        ),
      ]
    );

    t.mapSideEffect(
      (vm) => vm.open,
      (open) => {
        // The dialog has to be in the DOM before we can call `showModal`, etc. Assume
        // this view will be mounted in the parent DOM straight away.
        // #hydrogen-assume-view-mounted-right-away -
        // https://github.com/vector-im/hydrogen-web/issues/1069
        requestAnimationFrame(() => {
          // Prevent doing extra work if the modal is already closed or open and already
          // matches our intention
          const isAlreadyOpen = !!dialog.getAttribute('open');
          if (open && !isAlreadyOpen) {
            this.showModal();
          } else if (isAlreadyOpen) {
            this.closeModal();
          }
        });
      }
    );

    return dialog;
  }

  get dialogNode() {
    return this.root();
  }

  onDialogClicked(event) {
    // Close the dialog when the backdrop is clicked. The `::backdrop` is considered
    // part of the `dialogNode` but we have a `modalInner` element that stops clicks on
    // the dialog content itself counting as a click on it. So the only clicks to the
    // dialog will be on the backdrop and we can safely assume they meant to close it.
    if (event.target === this.dialogNode) {
      this.closeModal();
    }
  }

  onNativeDialogClosed() {
    this._vm.closeCallback();
  }

  showModal() {
    this.dialogNode.showModal();
  }

  closeModal() {
    this.dialogNode.close();
    this._vm.closeCallback();
  }
}

export default ModalView;
