/** Retained localhost-only evaluation; never reads credentials. */
import {runResearchFixtureEvaluation} from '../../../scripts/evaluate-research-fixture.js'
const output='docs/validation/contract-catalog-recheck-20261109/b-product/fixture-product-first'
await runResearchFixtureEvaluation(output).then(report=>console.log(JSON.stringify({qualifiedPairs:report.qualifiedPairs,realModelRequests:0})))
