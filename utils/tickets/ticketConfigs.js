const { getEmoji } = require('../emoji.js');

const TICKET_CONFIGS = {
  clan: {
    approveDesc: async (user) => {
      const coc = getEmoji('coc');
      const yellowarrow = getEmoji('yellowarrow');
      const stars = getEmoji('stars');
      const parrow = getEmoji('parrow');
      return `Hey ${user}! ${stars}\n\n` +
        `${coc} We are delighted to inform you that you have been **selected** for our clans!\n\n` +
        `${parrow} Our team is working on your placement, and you will be assigned to one of our clans as soon as possible. We kindly ask for your patience in the meantime. ${yellowarrow}\n\n` +
        `${stars} **Welcome to the Blood Alliance family!**`;
    },
    rejectDesc: async (user) => {
      const bird = getEmoji('bird');
      const cocfight = getEmoji('cocfight');
      return `Hello ${user},\n\n` +
        `${bird} Thank you for your interest in joining our clans. Your application has been **declined**.\n\n` +
        `${cocfight} We appreciate your time and wish you the very best in your search for a clan!`;
    }
  },
  fwa: {
    approveDesc: async (user) => {
      const whitefwa = getEmoji('whitefwa');
      const yellowarrow = getEmoji('yellowarrow');
      const stars = getEmoji('stars');
      const parrow = getEmoji('parrow');
      return `Hey ${user}! ${whitefwa}\n\n` +
        `${whitefwa} We are delighted to inform you that your **FWA Clan** application has been **approved**!\n\n` +
        `${parrow} Our team is working on your placement. We kindly ask for your patience in the meantime. ${yellowarrow}\n\n` +
        `${stars} **Welcome to the Blood Alliance family!**`;
    },
    rejectDesc: async (user) => {
      const bird = getEmoji('bird');
      const cocfight = getEmoji('cocfight');
      return `Hello ${user},\n\n` +
        `${bird} Thank you for your interest in joining our FWA clans. Your application has been **declined**.\n\n` +
        `${cocfight} We appreciate your time and wish you the very best in your search for a clan!`;
    }
  },
  war: {
    approveDesc: async (user) => {
      const cocfight = getEmoji('cocfight');
      const yellowarrow = getEmoji('yellowarrow');
      const stars = getEmoji('stars');
      const parrow = getEmoji('parrow');
      return `Hey ${user}! ${cocfight}\n\n` +
        `${cocfight} We are delighted to inform you that your **War Clan** application has been **approved**!\n\n` +
        `${parrow}Our team is working on your placement. We kindly ask for your patience in the meantime. ${yellowarrow}\n\n` +
        `${stars} **Welcome to the Blood Alliance family!**`;
    },
    rejectDesc: async (user) => {
      const bird = getEmoji('bird');
      const cocfight = getEmoji('cocfight');
      return `Hello ${user},\n\n` +
        `${bird} Thank you for your interest in joining our War clans. Your application has been **declined**.\n\n` +
        `${cocfight} We appreciate your time and wish you the very best in your search for a clan!`;
    }
  },
  rep: {
    approveDesc: async (user) => {
      const crown = getEmoji('crown');
      const parrow = getEmoji('parrow');
      return `Hey ${user}! ${crown}\n\n` +
        `${crown} We are excited to inform you that your application to become a **Clan Representative** has been **approved**!\n\n` +
        `${parrow} Welcome to the inner circle of the Blood Alliance. Your role is vital in helping our clans thrive and maintaining our standard of excellence.\n\n` +
        `${parrow} Please stay tuned; a member of our leadership team will reach out to you shortly with your next steps.`;
    },
    rejectDesc: async (user) => {
      const bird = getEmoji('bird');
      const cocfight = getEmoji('cocfight');
      return `Hello ${user},\n\n` +
        `${bird} Thank you for your interest in representing a clan within the Blood Alliance. Your application has been **declined**.\n\n` +
        `${cocfight} We truly appreciate your enthusiasm and the time you took to apply. We wish you and your clan continued success!`;
    }
  },
  staff: {
    approveDesc: async (user) => {
      const wow = getEmoji('wow');
      const stars = getEmoji('stars');
      const yarrow = getEmoji('yarrow');
      const rarroww = getEmoji('rarroww');
      return `Hey ${user}! ${stars}\n\n` +
        `${wow} Congratulations! Your application to join our **Staff Team** has been **approved**!\n\n` +
        `${yarrow} We are thrilled to have you on board. Your support and dedication will help us make the Blood Alliance even better.\n\n` +
        `${rarroww} Please keep an eye on your DMs; a member of our senior staff will contact you shortly with further instructions and onboarding. ${stars} Welcome to the team!`;
    },
    rejectDesc: async (user) => {
      const bird = getEmoji('bird');
      const stars = getEmoji('stars');
      return `Hello ${user},\n\n` +
        `${bird} Thank you for your interest in supporting the Blood Alliance as a staff member. Your application has been **declined**.\n\n` +
        `${stars} While we won't be moving forward at this time, we truly appreciate your willingness to help. We encourage you to keep being an active member of our community!`;
    }
  },
  alliance: {
    approveDesc: async (user) => {
      const blood = getEmoji('blood');
      const cocfight = getEmoji('cocfight');
      const parrow = getEmoji('parrow');
      return `Hey ${user}! ${blood}\n\n` +
        `${blood} A massive welcome to the **Blood Alliance** family! Your application for your clan to join our ranks has been **approved**!\n\n` +
        `${parrow} We are honored to have you and your warriors standing alongside us. This is the beginning of a powerful partnership.\n\n` +
        `${parrow} Our leadership team will contact you shortly to finalize the integration details and welcome you properly. ${cocfight} Let the journey begin!`;
    },
    rejectDesc: async (user) => {
      const bird = getEmoji('bird');
      const sheild = getEmoji('sheild');
      return `Hello ${user},\n\n` +
        `${bird} Thank you for your interest in bringing your clan into the Blood Alliance. After careful review, your application has been **declined** at this time.\n\n` +
        `${sheild} We appreciate the effort you put into your application and wish your clan nothing but strength and victory on the battlefield.`;
    }
  },
  help: {
    approveDesc: async (user) => {
      const question = getEmoji('question');
      const yarrow = getEmoji('yarrow');
      return `Hey ${user}!\n\n` +
        `${question} Your request for **Help & Assistance** has been reviewed and marked as **resolved/addressed**!\n\n` +
        `${yarrow} We hope we were able to provide the clarity you needed. If you have more questions in the future, don't hesitate to open a new ticket!`;
    },
    rejectDesc: async (user) => {
      const bird = getEmoji('bird');
      const parrow = getEmoji('parrow');
      return `Hello ${user},\n\n` +
        `${bird} Your **Help & Assistance** ticket has been **closed**.\n\n` +
        `${parrow}If your issue wasn't fully resolved, please feel free to open a new ticket or contact a staff member directly.`;
    }
  }
};

module.exports = TICKET_CONFIGS;
