'use strict';

const { TemplateView } = require('hydrogen-view-sdk');
const assert = require('../lib/assert');

class ModalView extends TemplateView {
  constructor(ContentViewClass, vm) {
    assert(ContentViewClass);
    assert(vm);

    super(vm);
    this._ContentViewClass = ContentViewClass;
  }

  render(t, vm) {
    const dialog = t.dialog(
      {
        className: {
          ModalView_modal: true,
        },
        onClick: (event) => this.onDialogClicked(event),
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
              t.h3('Developer options'),
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
        // The dialog has to be in the DOM before we can call `showModal`, etc.
        // Assume this view will be mounted in the parent DOM straight away.
        requestAnimationFrame(() => {
          console.log('side-effect dialog open', open);
          if (open) {
            this.showModal();
          } else {
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
    if (event.target === this.dialogNode) {
      this.closeModal();
    }
  }

  showModal() {
    this.dialogNode.showModal();
  }

  closeModal() {
    this.dialogNode.close();
  }
}

module.exports = ModalView;