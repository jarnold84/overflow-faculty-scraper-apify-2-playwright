import { Actor } from 'apify';
import { PlaywrightCrawler, log } from 'crawlee';

// Import your proven Phase 1 helper functions
import { 
    calculateEmailConfidence,
    findProfileLink,
    getUniversityName,
    getDepartmentName,
    cleanName,
    cleanTitle,
    cleanEmail,
    cleanPhone
} from './helpers.js';

await Actor.init();

const input = await Actor.getInput();
const { 
    startUrls = [],
    maxRequestsPerCrawl = 100,
    headless = true,
    extractionMethod = 'auto', // 'auto', 'kansas', 'illinois', 'utah', 'tabular'
    enableAuth = false,
    authCredentials = {}
} = input;

// Enhanced extraction methods adapted for Playwright
class PlaywrightFacultyExtractor {
    constructor(page) {
        this.page = page;
        this.universityName = null;
        this.departmentName = null;
        this.profileLinks = [];
    }

    async initialize(url) {
        // Wait for page to fully load
        await this.page.waitForLoadState('networkidle');
        
        // Extract university and department info
        this.universityName = await this.getUniversityName(url);
        this.departmentName = await this.getDepartmentName();
        
        // Pre-extract all profile links for matching
        this.profileLinks = await this.extractAllProfileLinks();
        
        log.info(`Initialized for ${this.universityName} - ${this.departmentName}`);
        log.info(`Found ${this.profileLinks.length} profile links`);
    }

    async extractAllProfileLinks() {
        const links = await this.page.$$eval('a[href*="/people/"], a[href*="/faculty/"], a[href*="/staff/"], a[href*="profile"], a[href*="bio"]', 
            links => links.map(link => ({
                href: link.href,
                text: link.textContent.trim(),
                title: link.title || ''
            }))
        );
        return links.filter(link => link.text && link.text.length > 3);
    }

    // Method 1: Kansas-style (.views-row structure)
    async extractKansasStyle() {
        log.info('Attempting Kansas-style extraction...');
        
        const faculty = await this.page.$$eval('.views-row', (rows) => {
            return rows.map(row => {
                const nameElement = row.querySelector('.views-field-title a, .views-field-field-person-name a, h3 a, h2 a');
                const titleElement = row.querySelector('.views-field-field-person-title, .field-person-title, .person-title');
                const emailElement = row.querySelector('a[href^="mailto:"]');
                const phoneElement = row.querySelector('.views-field-field-person-phone, .field-person-phone');
                
                return {
                    name: nameElement?.textContent.trim() || '',
                    title: titleElement?.textContent.trim() || '',
                    email: emailElement?.href.replace('mailto:', '') || '',
                    phone: phoneElement?.textContent.trim() || '',
                    profileLink: nameElement?.href || ''
                };
            }).filter(person => person.name);
        });

        return this.processFacultyData(faculty, 'kansas');
    }

    // Method 2: Illinois-style (Card-based with enhanced Playwright capabilities)
    async extractIllinoisStyle() {
        log.info('Attempting Illinois-style extraction...');
        
        // Wait for any dynamic content to load
        await this.page.waitForSelector('div[class*="person"], .person-card, .faculty-card, .staff-card', 
            { timeout: 5000 }).catch(() => {});
        
        const faculty = await this.page.evaluate(() => {
            const cards = document.querySelectorAll('div[class*="person"], .person-card, .faculty-card, .staff-card');
            
            return Array.from(cards).map(card => {
                // Enhanced name extraction with multiple fallbacks
                const nameSelectors = [
                    'h1, h2, h3, h4',
                    '.name, .person-name, .faculty-name',
                    'a[href*="/people/"], a[href*="/faculty/"]',
                    '.title-link, .person-link'
                ];
                
                let nameElement = null;
                for (const selector of nameSelectors) {
                    nameElement = card.querySelector(selector);
                    if (nameElement && nameElement.textContent.trim()) break;
                }
                
                // Enhanced title extraction
                const titleSelectors = [
                    '.person-title, .faculty-title, .job-title',
                    '.position, .role',
                    'p, div, span'
                ];
                
                let titleElement = null;
                for (const selector of titleSelectors) {
                    const elements = card.querySelectorAll(selector);
                    for (const el of elements) {
                        const text = el.textContent.trim();
                        if (text && (text.includes('Professor') || text.includes('Instructor') || 
                                    text.includes('Director') || text.includes('Lecturer'))) {
                            titleElement = el;
                            break;
                        }
                    }
                    if (titleElement) break;
                }
                
                // Enhanced email extraction
                const emailElement = card.querySelector('a[href^="mailto:"]');
                let email = emailElement?.href.replace('mailto:', '') || '';
                
                // Phone extraction
                const phoneElement = card.querySelector('.phone, .tel, a[href^="tel:"]');
                let phone = phoneElement?.textContent.trim() || phoneElement?.href.replace('tel:', '') || '';
                
                // Profile link extraction
                const profileElement = nameElement?.href || card.querySelector('a[href*="/people/"], a[href*="/faculty/"]')?.href || '';
                
                return {
                    name: nameElement?.textContent.trim() || '',
                    title: titleElement?.textContent.trim() || '',
                    email: email,
                    phone: phone,
                    profileLink: profileElement
                };
            }).filter(person => person.name && !person.name.includes('Professor of') && !person.name.includes('Director of'));
        });

        return this.processFacultyData(faculty, 'illinois');
    }

    // Method 3: Utah-style (Table/markdown with profile links)
    async extractUtahStyle() {
        log.info('Attempting Utah-style extraction...');
        
        const faculty = await this.page.evaluate(() => {
            const rows = document.querySelectorAll('tr, .faculty-row, .person-row');
            
            return Array.from(rows).map(row => {
                const nameElement = row.querySelector('a[href*=".php"], a[href*="/people/"], a[href*="/faculty/"], td:first-child a, .name a');
                const cells = row.querySelectorAll('td, .cell, .field');
                
                let title = '';
                let email = '';
                let phone = '';
                
                // Extract from table cells
                if (cells.length > 1) {
                    title = cells[1]?.textContent.trim() || '';
                    email = row.querySelector('a[href^="mailto:"]')?.href.replace('mailto:', '') || '';
                    phone = cells[2]?.textContent.trim() || '';
                }
                
                return {
                    name: nameElement?.textContent.trim() || '',
                    title: title,
                    email: email,
                    phone: phone,
                    profileLink: nameElement?.href || ''
                };
            }).filter(person => person.name);
        });

        return this.processFacultyData(faculty, 'utah');
    }

    // Method 4: Tabular/UNF-style (Database-style tables)
    async extractTabularStyle() {
        log.info('Attempting Tabular-style extraction...');
        
        const faculty = await this.page.$$eval('table tr, .table-row', (rows) => {
            return rows.map(row => {
                const cells = row.querySelectorAll('td, .cell');
                if (cells.length < 2) return null;
                
                const nameCell = cells[0];
                const nameElement = nameCell.querySelector('a') || nameCell;
                
                return {
                    name: nameElement.textContent.trim(),
                    title: cells[1]?.textContent.trim() || '',
                    email: row.querySelector('a[href^="mailto:"]')?.href.replace('mailto:', '') || '',
                    phone: cells[2]?.textContent.trim() || '',
                    profileLink: nameElement.href || ''
                };
            }).filter(person => person && person.name);
        });

        return this.processFacultyData(faculty, 'tabular');
    }

    // Auto-detection method
    async detectAndExtract() {
        log.info('Auto-detecting extraction method...');
        
        // Check for Kansas-style structure
        const hasKansasStyle = await this.page.$('.views-row') !== null;
        if (hasKansasStyle) {
            log.info('Detected Kansas-style structure');
            return await this.extractKansasStyle();
        }
        
        // Check for Illinois-style cards
        const hasIllinoisStyle = await this.page.$('div[class*="person"], .person-card, .faculty-card') !== null;
        if (hasIllinoisStyle) {
            log.info('Detected Illinois-style structure');
            return await this.extractIllinoisStyle();
        }
        
        // Check for Utah-style tables with profile links
        const hasUtahStyle = await this.page.$('a[href*=".php"], table tr') !== null;
        if (hasUtahStyle) {
            log.info('Detected Utah-style structure');
            return await this.extractUtahStyle();
        }
        
        // Default to tabular
        log.info('Using tabular extraction as fallback');
        return await this.extractTabularStyle();
    }

    // Process and enhance extracted faculty data
    async processFacultyData(rawFaculty, method) {
        log.info(`Processing ${rawFaculty.length} faculty records with ${method} method`);
        
        const processedFaculty = rawFaculty.map(person => {
            // Clean and enhance data using Phase 1 helper functions
            const cleanedName = cleanName(person.name);
            const cleanedEmail = cleanEmail(person.email);
            
            // Find matching profile link if not already present
            let profileLink = person.profileLink;
            if (!profileLink && cleanedName) {
                profileLink = findProfileLink(cleanedName, this.profileLinks);
            }
            
            // Calculate email confidence
            const emailConfidence = calculateEmailConfidence(cleanedName, cleanedEmail);
            
            return {
                name: cleanedName,
                titles: person.title ? [cleanTitle(person.title)] : [],
                profileLink: profileLink,
                email: cleanedEmail,
                emailConfidence: emailConfidence,
                emailSource: emailConfidence > 0.5 ? 'name-matched' : 'generic',
                phone: cleanPhone(person.phone),
                university: this.universityName,
                department: this.departmentName,
                extractionMethod: method,
                sourceUrl: this.page.url(),
                scrapedAt: new Date().toISOString()
            };
        }).filter(person => person.name && person.name.length > 2);
        
        log.info(`Successfully processed ${processedFaculty.length} faculty records`);
        return processedFaculty;
    }

    // Helper methods (adapted from Phase 1)
    async getUniversityName(url) {
        const universityName = await this.page.evaluate(() => {
            // Try multiple selectors for university name
            const selectors = [
                'title',
                '.university-name, .institution-name',
                'h1',
                '.site-title, .site-name'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.includes('University')) {
                    return element.textContent.trim();
                }
            }
            
            return document.title || '';
        });
        
        return getUniversityName(url, universityName);
    }

    async getDepartmentName() {
        const departmentName = await this.page.evaluate(() => {
            const selectors = [
                '.department-name, .school-name',
                'h1, h2',
                '.page-title, .section-title'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && (element.textContent.includes('Music') || 
                               element.textContent.includes('Arts') ||
                               element.textContent.includes('Fine Arts'))) {
                    return element.textContent.trim();
                }
            }
            
            return '';
        });
        
        return getDepartmentName(departmentName);
    }
}

// Initialize the crawler
const crawler = new PlaywrightCrawler({
    headless,
    requestHandler: async ({ request, page, log }) => {
        log.info(`Processing: ${request.loadedUrl}`);
        
        try {
            // Initialize extractor
            const extractor = new PlaywrightFacultyExtractor(page);
            await extractor.initialize(request.loadedUrl);
            
            // Handle authentication if needed
            if (enableAuth && authCredentials.username && authCredentials.password) {
                await handleAuthentication(page, authCredentials);
            }
            
            // Extract faculty data based on method
            let faculty = [];
            if (extractionMethod === 'auto') {
                faculty = await extractor.detectAndExtract();
            } else {
                const methodMap = {
                    'kansas': () => extractor.extractKansasStyle(),
                    'illinois': () => extractor.extractIllinoisStyle(),
                    'utah': () => extractor.extractUtahStyle(),
                    'tabular': () => extractor.extractTabularStyle()
                };
                
                if (methodMap[extractionMethod]) {
                    faculty = await methodMap[extractionMethod]();
                } else {
                    faculty = await extractor.detectAndExtract();
                }
            }
            
            // Push results to dataset
            if (faculty.length > 0) {
                await Actor.pushData(faculty);
                log.info(`Successfully scraped ${faculty.length} faculty members`);
            } else {
                log.warning('No faculty data extracted');
            }
            
        } catch (error) {
            log.error(`Error processing ${request.loadedUrl}: ${error.message}`);
        }
    },
    
    failedRequestHandler: async ({ request, log }) => {
        log.error(`Request failed: ${request.loadedUrl}`);
    },
    
    maxRequestsPerCrawl,
});

// Authentication helper
async function handleAuthentication(page, credentials) {
    log.info('Handling authentication...');
    
    // Look for login forms
    const usernameSelector = 'input[type="text"][name*="user"], input[type="email"][name*="user"], input[name="username"], input[name="email"]';
    const passwordSelector = 'input[type="password"]';
    const submitSelector = 'button[type="submit"], input[type="submit"], .login-button';
    
    const usernameField = await page.$(usernameSelector);
    const passwordField = await page.$(passwordSelector);
    const submitButton = await page.$(submitSelector);
    
    if (usernameField && passwordField && submitButton) {
        await usernameField.fill(credentials.username);
        await passwordField.fill(credentials.password);
        await submitButton.click();
        
        // Wait for navigation after login
        await page.waitForLoadState('networkidle');
        log.info('Authentication completed');
    } else {
        log.warning('Login form not found');
    }
}

// Add URLs to queue and start crawling
await crawler.addRequests(startUrls);
await crawler.run();

await Actor.exit();
