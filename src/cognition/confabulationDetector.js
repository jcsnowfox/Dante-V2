const { claimsPersonalPerception } = require('./perceptionBoundary');

function detectConfabulation(responseText = '', classifiedClaims = []) {
  const unsupportedClaims = classifiedClaims.filter((claim) => claim.violation || (claimsPersonalPerception(claim.text) && !claim.personallyPerceived));
  const responseHasSensoryClaim = claimsPersonalPerception(responseText);
  const hasSupportedSensoryClaim = classifiedClaims.some((claim) => claimsPersonalPerception(claim.text) && claim.personallyPerceived);
  const unsupportedResponse = responseHasSensoryClaim && !hasSupportedSensoryClaim;
  const detected = unsupportedClaims.length > 0 || unsupportedResponse;

  return {
    detected,
    unsupportedClaims,
    confidenceMultiplier: detected ? 0.45 : 1,
    recommendation: detected
      ? "Rewrite unsupported sensory language into evidence-bound honesty, e.g. 'I can't verify that' or 'I only know what you showed me.'"
      : null,
  };
}

module.exports = { detectConfabulation };
