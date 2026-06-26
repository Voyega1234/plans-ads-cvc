import { CampaignBlueprintJson, QACheckResult } from '@/types'

export function runLocalQARules(blueprint: CampaignBlueprintJson): QACheckResult[] {
  const checks: QACheckResult[] = []

  for (const campaign of blueprint.campaigns) {
    // Check daily budget
    if (campaign.budget < 100) {
      checks.push({
        checkName: `Budget Check - ${campaign.campaignName}`,
        severity: 'error',
        status: 'fail',
        message: `Daily budget ฿${campaign.budget} is below minimum ฿100`,
        recommendation: 'Increase daily budget to at least ฿100',
      })
    } else {
      checks.push({
        checkName: `Budget Check - ${campaign.campaignName}`,
        severity: 'error',
        status: 'pass',
        message: `Daily budget ฿${campaign.budget} meets minimum requirement`,
      })
    }

    // Check campaign status
    if (campaign.status === 'PAUSED') {
      checks.push({
        checkName: `Status Check - ${campaign.campaignName}`,
        severity: 'info',
        status: 'pass',
        message: 'Campaign will be created as PAUSED (recommended for initial setup)',
      })
    }

    for (const adGroup of campaign.adGroups) {
      // Check keyword count
      if (campaign.campaignType === 'SEARCH') {
        if (adGroup.keywords.length < 3) {
          checks.push({
            checkName: `Keywords - ${campaign.campaignName} / ${adGroup.adGroupName}`,
            severity: 'warning',
            status: 'warning',
            message: `Ad group has only ${adGroup.keywords.length} keyword(s). Recommend at least 5.`,
            recommendation: 'Add more relevant keywords to improve coverage',
          })
        } else if (adGroup.keywords.length > 20) {
          checks.push({
            checkName: `Keywords - ${campaign.campaignName} / ${adGroup.adGroupName}`,
            severity: 'warning',
            status: 'warning',
            message: `Ad group has ${adGroup.keywords.length} keywords. Consider splitting into multiple ad groups.`,
            recommendation: 'Split keywords by theme into separate ad groups',
          })
        } else {
          checks.push({
            checkName: `Keywords - ${campaign.campaignName} / ${adGroup.adGroupName}`,
            severity: 'info',
            status: 'pass',
            message: `Ad group has ${adGroup.keywords.length} keywords (optimal range)`,
          })
        }
      }

      // Check ad copy character limits
      for (const ad of adGroup.ads) {
        const headlineChecks = [
          { text: ad.headline1, name: 'Headline 1', limit: 30 },
          { text: ad.headline2, name: 'Headline 2', limit: 30 },
          { text: ad.headline3, name: 'Headline 3', limit: 30 },
          { text: ad.description1, name: 'Description 1', limit: 90 },
          { text: ad.description2, name: 'Description 2', limit: 90 },
        ]

        for (const hc of headlineChecks) {
          if (hc.text && hc.text.length > hc.limit) {
            checks.push({
              checkName: `Ad Copy - ${hc.name}`,
              severity: 'error',
              status: 'fail',
              message: `${hc.name} "${hc.text}" exceeds ${hc.limit} characters (${hc.text.length} chars)`,
              recommendation: `Shorten ${hc.name} to max ${hc.limit} characters`,
            })
          }
        }

        // Check final URL
        if (!ad.finalUrl.startsWith('https://')) {
          checks.push({
            checkName: `Final URL - ${campaign.campaignName}`,
            severity: 'error',
            status: 'fail',
            message: `Final URL must use HTTPS: ${ad.finalUrl}`,
            recommendation: 'Update final URL to use https://',
          })
        }
      }
    }
  }

  // Check conversion actions
  if (!blueprint.conversionActions || blueprint.conversionActions.length === 0) {
    checks.push({
      checkName: 'Conversion Tracking',
      severity: 'error',
      status: 'fail',
      message: 'No conversion actions defined',
      recommendation: 'Add at least one conversion action before launching',
    })
  } else {
    checks.push({
      checkName: 'Conversion Tracking',
      severity: 'error',
      status: 'pass',
      message: `${blueprint.conversionActions.length} conversion action(s) defined`,
    })
  }

  return checks
}

export function calculateQAScore(checks: QACheckResult[]): number {
  if (checks.length === 0) return 100
  const errorWeight = 15
  const warningWeight = 5
  const errors = checks.filter((c) => c.status === 'fail' && c.severity === 'error').length
  const warnings = checks.filter((c) => c.status === 'warning').length
  const deductions = errors * errorWeight + warnings * warningWeight
  return Math.max(0, 100 - deductions)
}
