/**
 * Ticket Channel Name Utilities
 * Standardizes ticket names:
 *   - Claimed:  claimed-🟡-<ticketname>
 *   - Approved: approved-🟢-<ticketname>
 *   - Rejected: rejected-🔴-<ticketname> (or reject-🔴-<ticketname>)
 */

function cleanTicketName(name) {
    if (!name) return '';
    let result = name;
    let prev = '';
    while (result !== prev) {
        prev = result;
        result = result
            .replace(/^(approved|rejected|claimed|reject|claim)[-_]/gi, '')
            .replace(/^[-_\s]*[🟢🔴🟡⚪🔵]\s*[-_]?\s*/g, '')
            .replace(/^[-_\s]+/, '');
    }
    return result;
}

function formatTicketName(name, status) {
    const clean = cleanTicketName(name);
    if (!clean) return name;
    switch (status) {
        case 'claim':
        case 'claimed':
            return `claimed-🟡-${clean}`;
        case 'approve':
        case 'approved':
            return `approved-🟢-${clean}`;
        case 'reject':
        case 'rejected':
            return `rejected-🔴-${clean}`;
        default:
            return clean;
    }
}

function getTicketType(name) {
    const clean = cleanTicketName(name);
    return clean.split('-')[0].toLowerCase();
}

module.exports = {
    cleanTicketName,
    formatTicketName,
    getTicketType
};
