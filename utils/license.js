const crypto = require('crypto');

// Hardcoded PEM Public Key
// Shipped publically in the repository. Safe to commit.
// This key can ONLY verify licenses; it CANNOT be used to generate them.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4FZMqdhDfJJU2NP+Oyb3
K468NqUUJ4aAYkH4mmIWky+eSr+xLpZaB5InWrCeu+MHyB/l9vfF/kIsHdXPYjHB
gJJEDJcCPP9hWmRT9M+1Jq2tOZPsHe9wjL46mOizgO21bTjV5bMAaGKadQUd8QNz
2GWz9NqN0Whvm8nIfEr0kpvFQEaWgEjEfb3YH4t4xIDONbT0aNYVhP4nvNPxJcZN
JTyVWP3jmZptPvITLWfAGKw8ayQgItZUijM5AuJInbOiJT08NsbNEhdA5f96oXL+
vtTSLCTvKLNPGNIBnw0XeYMHzO6soQjcUKoQOpiL/RK6jv9EzdDv1Ez6sL17vd4k
PQIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Validates the offline license key using asymmetric cryptographic signature verification.
 * @param {string} licenseKey - The license key string.
 * @returns {object} Validation result containing status, licensee name, and expiry info.
 */
function validateLicenseKey(licenseKey) {
    if (!licenseKey) {
        return { isLicensed: false };
    }
    
    const parts = licenseKey.trim().split('.');
    if (parts.length !== 3) {
        return { isLicensed: false, error: 'Malformed license key' };
    }
    
    const [companyNameBase64, expiresAt, signatureHex] = parts;
    let companyName;
    try {
        companyName = Buffer.from(companyNameBase64, 'base64').toString('utf8');
    } catch (e) {
        return { isLicensed: false, error: 'Invalid licensee encoding' };
    }
    
    // The data to sign is "companyNameBase64:expiresAt"
    const dataToVerify = `${companyNameBase64}:${expiresAt}`;
    
    try {
        // Cryptographically verify signature using the hardcoded public key
        const isSignatureValid = crypto.verify(
            'sha256',
            Buffer.from(dataToVerify),
            PUBLIC_KEY,
            Buffer.from(signatureHex, 'hex')
        );
        
        if (!isSignatureValid) {
            return { isLicensed: false, error: 'Invalid signature (forged key)' };
        }
    } catch (e) {
        return { isLicensed: false, error: 'Signature verification failed' };
    }
    
    // Validate date format and expiration
    const expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) {
        return { isLicensed: false, error: 'Invalid expiration date format' };
    }
    
    const today = new Date();
    // Reset hours to start of day for accurate comparison
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);

    if (expiryDate < today) {
        return { 
            isLicensed: false, 
            error: 'License expired', 
            companyName, 
            expiresAt 
        };
    }
    
    return { 
        isLicensed: true, 
        companyName, 
        expiresAt 
    };
}

module.exports = {
    validateLicenseKey
};
