const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs").promises;

const COORDS = {
    heroes: [
        { name: "Barbarian King", x: 50, y: 481 },
        { name: "Archer Queen", x: 143, y: 482 },
        { name: "Grand Warden", x: 229, y: 482 },
        { name: "Royal Champion", x: 320, y: 480 },
        { name: "Dragon Duke", x: 401, y: 477 },
        { name: "Logger Guardian", x: 490, y: 479 }
    ],
    pets: [
        { name: "L.A.S.S.I", x: 50, y: 650 },
        { name: "Electro Owl", x: 138, y: 654 },
        { name: "Mighty Yak", x: 230, y: 650 },
        { name: "Unicorn", x: 316, y: 648 },
        { name: "Frosty", x: 403, y: 650 },
        { name: "Phoenix", x: 493, y: 650 },
        { name: "Diggy", x: 52, y: 743 },
        { name: "Poison Lizard", x: 138, y: 744 },
        { name: "Spirit Fox", x: 226, y: 744 },
        { name: "Angry Jelly", x: 314, y: 743 },
        { name: "Sneezy", x: 406, y: 743 },
        { name: "New Pet", x: 492, y: 744 }
    ],
    guardians: [
        { name: "Longshot", x: 49, y: 908 },
        { name: "Smasher", x: 136, y: 910 },
        { name: "Logger", x: 225, y: 910 }
    ],
    troops: [
        { name: "Barbarian", x: 632, y: 121 },
        { name: "Archer", x: 718, y: 120 },
        { name: "Giant", x: 800, y: 119 },
        { name: "Goblin", x: 882, y: 122 },
        { name: "Wall Breaker", x: 966, y: 119 },
        { name: "Balloon", x: 1056, y: 121 },
        { name: "Wizard", x: 1140, y: 119 },
        { name: "Healer", x: 1223, y: 121 },
        { name: "Dragon", x: 1308, y: 120 },
        { name: "P.E.K.K.A", x: 1396, y: 121 },
        { name: "Baby Dragon", x: 631, y: 217 },
        { name: "Miner", x: 713, y: 217 },
        { name: "Electro Dragon", x: 802, y: 217 },
        { name: "Yeti", x: 883, y: 217 },
        { name: "Dragon Rider", x: 968, y: 217 },
        { name: "Electro Titan", x: 1054, y: 217 },
        { name: "Root Rider", x: 1140, y: 216 },
        { name: "Druid", x: 1226, y: 218 },
        { name: "Minion", x: 1312, y: 216 },
        { name: "Hog Rider", x: 1393, y: 217 },
        { name: "Valkyrie", x: 630, y: 313 },
        { name: "Golem", x: 718, y: 315 },
        { name: "Witch", x: 800, y: 316 },
        { name: "Lava Hound", x: 887, y: 315 },
        { name: "Bowler", x: 967, y: 314 },
        { name: "Ice Golem", x: 1054, y: 315 },
        { name: "Headhunter", x: 1138, y: 313 },
        { name: "Apprentice Warden", x: 1224, y: 314 },
        { name: "Meteor Golem", x: 1310, y: 313 },
        { name: "Super Barbarian", x: 1391, y: 313 },
        { name: "Super Archer", x: 632, y: 413 }
    ],
    spells: [
        { name: "Lightning Spell", x: 632, y: 579 },
        { name: "Healing Spell", x: 720, y: 581 },
        { name: "Rage Spell", x: 803, y: 578 },
        { name: "Jump Spell", x: 886, y: 584 },
        { name: "Freeze Spell", x: 970, y: 580 },
        { name: "Clone Spell", x: 1056, y: 580 },
        { name: "Invisibility Spell", x: 1143, y: 580 },
        { name: "Recall Spell", x: 1224, y: 578 },
        { name: "Overgrowth Spell", x: 1309, y: 580 },
        { name: "Poison Spell", x: 1392, y: 584 },
        { name: "Earthquake Spell", x: 632, y: 663 },
        { name: "Haste Spell", x: 714, y: 668 },
        { name: "Skeleton Spell", x: 798, y: 667 },
        { name: "Bat Spell", x: 888, y: 667 },
        { name: "Revive Spell", x: 966, y: 669 },
        { name: "Ice Block Spell", x: 1054, y: 666 },
        { name: "Totem Spell", x: 1142, y: 668 }
    ],
    sieges: [
        { name: "Wall Wrecker", x: 627, y: 907 },
        { name: "Battle Blimp", x: 711, y: 910 },
        { name: "Stone Slammer", x: 795, y: 913 },
        { name: "Siege Barracks", x: 877, y: 913 },
        { name: "Log Launcher", x: 965, y: 909 },
        { name: "Flame Flinger", x: 1048, y: 910 },
        { name: "Battle Drill", x: 1133, y: 911 },
        { name: "Sky Wagon", x: 1219, y: 912 },
        { name: "New Siege", x: 1298, y: 911 }
    ]
};

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function normalizeName(name) {
    if (!name) return "";
    return name.toLowerCase().replace(/[\s\.\-_']/g, "");
}

const FALLBACK_MAX_LEVELS = {
    "Barbarian King": 95,
    "Archer Queen": 95,
    "Grand Warden": 70,
    "Royal Champion": 45,
    "Dragon Duke": 25,
    "Logger Guardian": 10,

    "L.A.S.S.I": 15,
    "Electro Owl": 15,
    "Mighty Yak": 15,
    "Unicorn": 15,
    "Frosty": 10,
    "Phoenix": 10,
    "Diggy": 10,
    "Poison Lizard": 10,
    "Spirit Fox": 10,
    "Angry Jelly": 10,
    "Sneezy": 10,
    "New Pet": 5,

    "Longshot": 10,
    "Smasher": 10,
    "Logger": 5,

    "Barbarian": 12,
    "Archer": 12,
    "Giant": 12,
    "Goblin": 10,
    "Wall Breaker": 12,
    "Balloon": 12,
    "Wizard": 12,
    "Healer": 9,
    "Dragon": 12,
    "P.E.K.K.A": 12,
    "Baby Dragon": 10,
    "Miner": 10,
    "Electro Dragon": 7,
    "Yeti": 6,
    "Dragon Rider": 5,
    "Electro Titan": 4,
    "Root Rider": 4,
    "Druid": 5,
    "Meteor Golem": 3,
    "Minion": 12,
    "Hog Rider": 12,
    "Valkyrie": 11,
    "Golem": 13,
    "Witch": 7,
    "Lava Hound": 7,
    "Bowler": 7,
    "Ice Golem": 7,
    "Headhunter": 4,
    "Apprentice Warden": 4,
    "Super Barbarian": 3,
    "Super Archer": 3,

    "Lightning Spell": 11,
    "Healing Spell": 10,
    "Rage Spell": 7,
    "Jump Spell": 5,
    "Freeze Spell": 8,
    "Clone Spell": 9,
    "Invisibility Spell": 5,
    "Recall Spell": 7,
    "Overgrowth Spell": 5,
    "Revive Spell": 4,
    "Ice Block Spell": 5,
    "Poison Spell": 8,
    "Earthquake Spell": 7,
    "Haste Spell": 6,
    "Skeleton Spell": 6,
    "Bat Spell": 6,
    "Totem Spell": 4,

    "Wall Wrecker": 5,
    "Battle Blimp": 5,
    "Stone Slammer": 5,
    "Siege Barracks": 5,
    "Log Launcher": 5,
    "Flame Flinger": 5,
    "Battle Drill": 5,
    "Sky Wagon": 4,
    "New Siege": 3
};

function drawBadge(ctx, x, y, level, unlocked = true, isMax = false) {
    const w = 28;
    const h = 22;
    const r = 4;
    
    ctx.save();
    
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - h / 2);
    ctx.lineTo(x + w / 2 - r, y - h / 2);
    ctx.quadraticCurveTo(x + w / 2, y - h / 2, x + w / 2, y - h / 2 + r);
    ctx.lineTo(x + w / 2, y + h / 2 - r);
    ctx.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - r, y + h / 2);
    ctx.lineTo(x - w / 2 + r, y + h / 2);
    ctx.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h / 2 - r);
    ctx.lineTo(x - w / 2, y - h / 2 + r);
    ctx.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + r, y - h / 2);
    ctx.closePath();

    if (isMax) {
        const grad = ctx.createLinearGradient(x - w/2, y - h/2, x + w/2, y + h/2);
        grad.addColorStop(0, "#ffe066");
        grad.addColorStop(1, "#c59200");
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = "#161616";
    }
    ctx.fill();
    
    ctx.strokeStyle = isMax ? "#7c5c00" : (unlocked ? "#424242" : "#2a2a2a");
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (isMax) {
        ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 0.5;
        ctx.shadowOffsetY = 0.5;
        ctx.fillStyle = "#000000"; // Black text on Gold background matches CoC perfectly!
    } else {
        ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = "#ffffff"; // White text on Black background
    }
    
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (unlocked && level > 0) {
        ctx.fillText(String(level), x, y + 1.5);
    } else {
        ctx.fillStyle = "#777777";
        ctx.fillText("—", x, y + 1.5);
    }
    
    ctx.restore();
}

async function generatePlayerCard(p) {
    const cocPath = path.join(__dirname, "../assets/images/coc.jpg");
    const coc2Path = path.join(__dirname, "../assets/images/coc2.jpg");
    
    const baseBuffer = await fs.readFile(cocPath);
    const bottomBuffer = await fs.readFile(coc2Path);

    const baseImg = await loadImage(baseBuffer);
    const bottomImg = await loadImage(bottomBuffer);

    const width = Math.max(baseImg.width, bottomImg.width);
    const height = baseImg.height + bottomImg.height;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(baseImg, 0, 0);
    ctx.drawImage(bottomImg, 0, baseImg.height);

    const thLevel = p.townHallLevel || 1;
    const extensions = [".png", ".jpg", ".jpeg", ".webp"];
    let thImgPath = null;
    
    for (const ext of extensions) {
        const checkPath = path.join(__dirname, `../assets/images/townhalls/th${thLevel}${ext}`);
        const exists = await fs.access(checkPath).then(() => true).catch(() => false);
        if (exists) {
            thImgPath = checkPath;
            break;
        }
    }

    if (thImgPath) {
        try {
            const thBuffer = await fs.readFile(thImgPath);
            const thImg = await loadImage(thBuffer);
            ctx.drawImage(thImg, 65, 75, 140, 140);
            console.log(`🏰 Dynamic Town Hall ${thLevel} building image drawn successfully from ${path.basename(thImgPath)}!`);
        } catch (thErr) {
            console.warn("⚠️ Dynamic Town Hall drawing failed:", thErr.message);
        }
    }

    const heroesData = p.heroes || [];
    for (const h of COORDS.heroes) {
        const found = heroesData.find(item => normalizeName(item.name) === normalizeName(h.name));
        const level = found?.level || 0;
        const maxLevel = found?.maxLevel || FALLBACK_MAX_LEVELS[h.name] || 0;
        const unlocked = level > 0;
        const isMax = unlocked && maxLevel > 0 && level >= maxLevel;
        
        drawBadge(ctx, h.x, h.y, level, unlocked, isMax);
    }

    const petsData = p.troops?.filter(t => t.village === "home") || [];
    for (const pet of COORDS.pets) {
        const found = petsData.find(item => normalizeName(item.name) === normalizeName(pet.name));
        const level = found?.level || 0;
        const maxLevel = found?.maxLevel || FALLBACK_MAX_LEVELS[pet.name] || 0;
        const unlocked = level > 0;
        const isMax = unlocked && maxLevel > 0 && level >= maxLevel;

        drawBadge(ctx, pet.x, pet.y, level, unlocked, isMax);
    }

    const guardiansData = p.troops?.filter(t => t.village === "home") || [];
    for (const guardian of COORDS.guardians) {
        const found = guardiansData.find(item => normalizeName(item.name) === normalizeName(guardian.name));
        const level = found?.level || 0;
        const maxLevel = found?.maxLevel || FALLBACK_MAX_LEVELS[guardian.name] || 0;
        const unlocked = level > 0;
        const isMax = unlocked && maxLevel > 0 && level >= maxLevel;

        drawBadge(ctx, guardian.x, guardian.y, level, unlocked, isMax);
    }

    const troopsData = p.troops?.filter(t => t.village === "home") || [];
    for (const troop of COORDS.troops) {
        const found = troopsData.find(item => normalizeName(item.name) === normalizeName(troop.name));
        const level = found?.level || 0;
        const maxLevel = found?.maxLevel || FALLBACK_MAX_LEVELS[troop.name] || 0;
        const unlocked = level > 0;
        const isMax = unlocked && maxLevel > 0 && level >= maxLevel;

        drawBadge(ctx, troop.x, troop.y, level, unlocked, isMax);
    }

    const spellsData = p.spells || [];
    for (const spell of COORDS.spells) {
        const found = spellsData.find(item => normalizeName(item.name) === normalizeName(spell.name));
        const level = found?.level || 0;
        const maxLevel = found?.maxLevel || FALLBACK_MAX_LEVELS[spell.name] || 0;
        const unlocked = level > 0;
        const isMax = unlocked && maxLevel > 0 && level >= maxLevel;

        drawBadge(ctx, spell.x, spell.y, level, unlocked, isMax);
    }

    const siegeData = p.troops?.filter(t => t.village === "home") || [];
    for (const siege of COORDS.sieges) {
        const found = siegeData.find(item => normalizeName(item.name) === normalizeName(siege.name));
        const level = found?.level || 0;
        const maxLevel = found?.maxLevel || FALLBACK_MAX_LEVELS[siege.name] || 0;
        const unlocked = level > 0;
        const isMax = unlocked && maxLevel > 0 && level >= maxLevel;

        drawBadge(ctx, siege.x, siege.y, level, unlocked, isMax);
    }

    return canvas.toBuffer("image/png");
}

module.exports = { generatePlayerCard };
