export default {
  extends: 'stylelint-config-standard',
  rules: {
    // The stylesheet is written by component, and the hero, the demo and the navigation share elements (a, img, h2) only in different parts of a
    // page. The rule would have the component rules reordered by specificity, which says nothing about this page, so it is off; every other rule is on.
    'no-descending-specificity': null,
    'selector-class-pattern': null,
    'declaration-block-no-redundant-longhand-properties': null,
  },
};
