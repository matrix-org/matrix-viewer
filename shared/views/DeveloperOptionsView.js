'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

class DeveloperOptionsView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: {
          DeveloperOptionsView: true,
        },
        href: vm.closeUrl,
      },
      [
        t.a({
          className: {
            DeveloperOptionsView_backdrop: true,
          },
          href: vm.closeUrl,
        }),
        t.div(
          {
            className: {
              DeveloperOptionsView_modal: true,
            },
          },
          [
            t.header({ className: 'DeveloperOptionsView_modalHeader' }, [
              t.h3('Developer options'),
              t.a(
                {
                  className: 'DeveloperOptionsView_modalDismissButton',
                  href: vm.closeUrl,
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
            t.section([
              t.h4(['Toggles']),
              t.div({ className: 'DeveloperOptionsView_settingsFlag' }, [
                t.label({ for: 'debugActiveDateIntersectionObserver' }, [
                  t.div({ className: 'DeveloperOptionsView_labelText' }, [
                    'Show active date borders (debug ',
                    t.code('IntersectionObserver'),
                    ')',
                  ]),
                  t.div(
                    { className: 'DeveloperOptionsView_microcopy' },
                    'Show red border and yellow background trail around the event that is driving the active date as you scroll around.'
                  ),
                ]),
                t.input({
                  id: 'debugActiveDateIntersectionObserver',
                  type: 'checkbox',
                  checked: (vm) => vm.debugActiveDateIntersectionObserver,
                  onInput: (event) =>
                    vm.toggleDebugActiveDateIntersectionObserver(event.target.checked),
                }),
              ]),
            ]),
            t.section([t.h4('Backend timing'), 'todo: window.tracingSpansForRequest']),
          ]
        ),
      ]
    );
  }
}

module.exports = DeveloperOptionsView;
