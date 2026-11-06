# Actual exit timelines

The deliberately vetoed quit is fault injection, not a historical reproduction.

| Batch / case | PID | Cleanup branch | Cleanup ms | Native exit + stdio close | Watchdog |
|---|---:|---|---:|---|---:|
| repeated-results / orchestration-background-c-e2186-rably-reports-to-its-parent | 28729 | sync | 0.901 | True | 0 |
| repeated-results / orchestration-background-c-e2186-rably-reports-to-its-parent-repeat1 | 30360 | sync | 0.987 | True | 0 |
| repeated-results / orchestration-background-c-e2186-rably-reports-to-its-parent-repeat2 | 32079 | sync | 0.888 | True | 0 |
| repeated-results / orchestration-background-c-e2186-rably-reports-to-its-parent-repeat3 | 33726 | sync | 0.915 | True | 0 |
| repeated-results / orchestration-background-c-e2186-rably-reports-to-its-parent-repeat4 | 35203 | sync | 0.915 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context | 29031 | async | 34.927 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context | 29369 | sync | 0.831 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat1 | 30707 | async | 36.767 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat1 | 31058 | sync | 0.818 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat2 | 32476 | async | 37.851 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat2 | 32798 | sync | 0.932 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat3 | 33987 | async | 36.007 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat3 | 34148 | sync | 0.889 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat4 | 35424 | async | 35.828 | True | 0 |
| repeated-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context-repeat4 | 35580 | sync | 0.89 | True | 0 |
| repeated-results / subagent-steering-live-chi-89a3d-p-drains-pending-correction | 29489 | sync | 0.78 | True | 0 |
| repeated-results / subagent-steering-live-chi-89a3d-p-drains-pending-correction-repeat1 | 31211 | sync | 0.831 | True | 0 |
| repeated-results / subagent-steering-live-chi-89a3d-p-drains-pending-correction-repeat2 | 33032 | sync | 0.908 | True | 0 |
| repeated-results / subagent-steering-live-chi-89a3d-p-drains-pending-correction-repeat3 | 34299 | sync | 0.831 | True | 0 |
| repeated-results / subagent-steering-live-chi-89a3d-p-drains-pending-correction-repeat4 | 35740 | sync | 0.81 | True | 0 |
| fixed-boundary-results / exit-lifecycle-diagnoses-a-31316-tive-process-is-still-alive | 44985 | sync | 0.452 | True | 1 |
| fixed-boundary-results / exit-lifecycle-diagnoses-a-31316-tive-process-is-still-alive | 45073 | sync | 0.463 | True | 0 |
| fixed-boundary-results / exit-lifecycle-root-task-s-f75d2-wned-process-before-restart | 43311 | async | 104.364 | True | 0 |
| fixed-boundary-results / exit-lifecycle-root-task-s-f75d2-wned-process-before-restart | 44474 | sync | 0.899 | True | 0 |
| final-desktop-results / exit-lifecycle-diagnoses-a-31316-tive-process-is-still-alive | 79905 | sync | 0.482 | True | 1 |
| final-desktop-results / exit-lifecycle-diagnoses-a-31316-tive-process-is-still-alive | 80003 | sync | 0.48 | True | 0 |
| final-desktop-results / exit-lifecycle-root-task-s-f75d2-wned-process-before-restart | 79587 | async | 98.003 | True | 0 |
| final-desktop-results / exit-lifecycle-root-task-s-f75d2-wned-process-before-restart | 79855 | sync | 0.862 | True | 0 |
| final-desktop-results / mcp-cancellation-stopping--6ab59-same-session-remains-usable | 80039 | sync | 1.172 | True | 0 |
| final-desktop-results / orchestration-background-c-e2186-rably-reports-to-its-parent | 80238 | sync | 0.94 | True | 0 |
| final-desktop-results / run-explanation-budget-del-07344-ion-across-Electron-restart | 81085 | sync | 0.81 | True | 0 |
| final-desktop-results / run-explanation-budget-del-07344-ion-across-Electron-restart | 81276 | sync | 0.821 | True | 0 |
| final-desktop-results / run-explanation-budget-ela-60dc3-ns-ownership-until-it-exits | 80739 | sync | 0.831 | True | 0 |
| final-desktop-results / run-explanation-budget-run-efec7-g-and-retained-host-history | 80461 | sync | 0.926 | True | 0 |
| final-desktop-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context | 81432 | async | 40.317 | True | 0 |
| final-desktop-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context | 81599 | sync | 0.869 | True | 0 |
| final-desktop-results / subagent-steering-epoch-ex-f75ba-can-be-explicitly-rewritten | 81729 | sync | 0.954 | True | 0 |
| final-desktop-results / subagent-steering-live-chi-89a3d-p-drains-pending-correction | 82094 | sync | 0.803 | True | 0 |
| final-verified-results / exit-lifecycle-diagnoses-a-31316-tive-process-is-still-alive | 22186 | sync | 0.411 | True | 1 |
| final-verified-results / exit-lifecycle-diagnoses-a-31316-tive-process-is-still-alive | 22271 | sync | 0.454 | True | 0 |
| final-verified-results / exit-lifecycle-root-task-s-7625d-wned-process-before-restart | 21435 | async | 100.846 | True | 0 |
| final-verified-results / exit-lifecycle-root-task-s-7625d-wned-process-before-restart | 21713 | sync | 0.929 | True | 0 |
| final-verified-results / exit-lifecycle-root-task-s-ccfbc-wned-process-before-restart | 21842 | async | 98.223 | True | 0 |
| final-verified-results / exit-lifecycle-root-task-s-ccfbc-wned-process-before-restart | 22127 | sync | 1.038 | True | 0 |
| final-verified-results / mcp-cancellation-stopping--6ab59-same-session-remains-usable | 22318 | sync | 1.086 | True | 0 |
| final-verified-results / orchestration-background-c-e2186-rably-reports-to-its-parent | 22531 | sync | 1.017 | True | 0 |
| final-verified-results / run-explanation-budget-del-07344-ion-across-Electron-restart | 23369 | sync | 0.956 | True | 0 |
| final-verified-results / run-explanation-budget-del-07344-ion-across-Electron-restart | 23544 | sync | 0.872 | True | 0 |
| final-verified-results / run-explanation-budget-ela-60dc3-ns-ownership-until-it-exits | 23040 | sync | 0.814 | True | 0 |
| final-verified-results / run-explanation-budget-run-efec7-g-and-retained-host-history | 22754 | sync | 0.902 | True | 0 |
| final-verified-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context | 23694 | async | 37.317 | True | 0 |
| final-verified-results / subagent-shutdown-app-quit-71e78--retains-the-frozen-context | 23874 | sync | 0.913 | True | 0 |
| final-verified-results / subagent-steering-epoch-ex-f75ba-can-be-explicitly-rewritten | 24018 | sync | 0.893 | True | 0 |
| final-verified-results / subagent-steering-live-chi-89a3d-p-drains-pending-correction | 24348 | sync | 0.869 | True | 0 |
