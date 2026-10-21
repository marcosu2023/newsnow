export const parameters = {
  "version": "news4-scorer-v1.0.0-20261019",
  "shrinkage": 0.5,
  "baseline_score": 50,
  "rules": {
    "H1": {
      "OR": 0.3849708736583379,
      "weight": 0.6204602111806509,
      "enabled": true,
      "recall": 0.7916666666666666
    },
    "A1:海外": {
      "OR": 0.4235607916204942,
      "weight": 0.6508154820073768,
      "enabled": true,
      "recall": 0.9117647058823529
    },
    "C:间接（国家竞争、产业前景）": {
      "OR": 1.8145335549009256,
      "weight": 1.3470462333939863,
      "enabled": true,
      "recall": 0.9411764705882353
    },
    "C:无": {
      "OR": 0.34641634102313057,
      "weight": 0.5885714408830338,
      "enabled": true,
      "recall": 0.8518518518518519
    },
    "E:与中国无关": {
      "OR": 0.3746182164235518,
      "weight": 0.61206063132957,
      "enabled": true,
      "recall": 0.875
    },
    "F:焦虑": {
      "OR": 1.844464995704196,
      "weight": 1.3581108186389637,
      "enabled": true,
      "recall": 0.868421052631579
    },
    "F:中性": {
      "OR": 0.5861524716227855,
      "weight": 0.7656059506187145,
      "enabled": true,
      "recall": 0.8771929824561403
    }
  },
  "method_lock_sha256": "c33e693b9677e212fae771720715bae9bb4fc3d1bea18e34b638e30b896b79f4",
  "mapping_lock_sha256": "2424b06bfd9e4a7f0106fc7b553dace6f0cf916f912c2fbf7de2dca051f34444",
  "evaluation_lock_sha256": "6fb18bcc0da7d3d2c27c0efba2414d586ef461de595496a2c8cf09b78e5f7e98",
  "rules_lock_sha256": "300079aebc943f28eb4b5d0959e08dd995047972b2a95458df63159adf327097",
  "summary_validation": "title-only proxy; summary-enabled path not empirically validated"
};
export const rulesSha256 = "445d9c9b1e76d3a649b338f6dbe295b377739c713476f3d00608a0858063d837";
export const weightsSha256 = "4c3de6c4a2c457635011a5eedd3e80ef76ffeee00576b1438f9a8124a1c5b5e9";
