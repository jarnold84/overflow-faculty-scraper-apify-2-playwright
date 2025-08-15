// Phase 1 Proven Helper Functions for Phase 2 Playwright Integration

export function calculateEmailConfidence(name, email) {
    if (!name || !email || email.length < 5) return 0.1;
    
    const nameParts = name.toLowerCase().split(' ').filter(part => part.length > 1);
    if (nameParts.length < 2) return 0.3;
    
    const [firstName, lastName] = [nameParts[0], nameParts[nameParts.length - 1]];
    const emailLocal = email.split('@')[0].toLowerCase();
    
    // Perfect match: firstname.lastname
    if (emailLocal === `${firstName}.${lastName}`) return 0.95;
    
    // Good match: firstname.lastinitial
    if (emailLocal === `${firstName}.${lastName[0]}`) return 0.85;
    
    // Good match: firstinitial.lastname
    if (emailLocal === `${firstName[0]}.${lastName}`) return 0.85;
    
    // Partial match: contains both names
    if (emailLocal.includes(firstName) && emailLocal.includes(lastName)) return 0.75;
    
    // Partial match: contains first name
    if (emailLocal.includes(firstName)) return 0.6;
    
    // Partial match: contains last name  
    if (emailLocal.includes(lastName)) return 0.5;
    
    // Generic department email
    return 0.1;
}

export function findProfileLink(name, profileLinks) {
    if (!name || !profileLinks.length) return '';
    
    const nameParts = name.toLowerCase().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    // Direct name match in link text
    const exactMatch = profileLinks.find(link => 
        link.text.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(link.text.toLowerCase())
    );
    if (exactMatch) return exactMatch.href;
    
    // Name parts in URL
    const urlMatch = profileLinks.find(link => {
        const url = link.href.toLowerCase();
        return (url.includes(firstName) && url.includes(lastName)) ||
               url.includes(`${firstName}-${lastName}`) ||
               url.includes(`${lastName}-${firstName}`);
    });
    if (urlMatch) return urlMatch.href;
    
    return '';
}

export function getUniversityName(url, pageTitle = '') {
    // Extract from URL
    const domain = new URL(url).hostname.toLowerCase();
    
    // Common university domain patterns
    if (domain.includes('kansas')) return 'University of Kansas';
    if (domain.includes('illinois')) return 'University of Illinois';
    if (domain.includes('utah')) return 'University of Utah';
    if (domain.includes('unf')) return 'University of North Florida';
    
    // Extract from page title
    if (pageTitle.includes('University')) {
        const match = pageTitle.match(/(.*?University[^|]*)/);
        if (match) return match[1].trim();
    }
    
    // Fallback to domain
    return domain.replace(/^www\./, '').replace('.edu', '');
}

export function getDepartmentName(pageContent = '') {
    const musicKeywords = [
        'School of Music',
        'College of Music', 
        'Department of Music',
        'Music Department',
        'School of Fine Arts',
        'College of Fine Arts'
    ];
    
    for (const keyword of musicKeywords) {
        if (pageContent.includes(keyword)) {
            return keyword;
        }
    }
    
    return 'Music Department';
}

export function cleanName(name) {
    if (!name) return '';
    
    return name
        .replace(/Dr\.|Prof\.|Professor|Mr\.|Ms\.|Mrs\./gi, '')
        .replace(/,\s*(Jr|Sr|III|II)\.?/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function cleanTitle(title) {
    if (!title) return '';
    
    return title
        .replace(/^\s*[-•]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function cleanEmail(email) {
    if (!email || !email.includes('@')) return '';
    
    return email.toLowerCase().trim();
}

export function cleanPhone(phone) {
    if (!phone) return '';
    
    // Remove common prefixes and clean formatting
    return phone
        .replace(/^(Phone|Tel|Office):\s*/i, '')
        .replace(/[^\d\-\(\)\.\s\+]/g, '')
        .trim();
}
