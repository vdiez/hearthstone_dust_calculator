let fs = require('fs-extra');
let got = require('got');
let sprintf = require('sprintf-js').sprintf;
let cards_file = "cards.collectible.json";
let collection_url = "https://hsreplay.net/api/v1/collection/?region=%(region)s&account_lo=%(account_lo)s";
let collection_file = "collection-%(region)s-%(account_lo)s.json";
let cards_url = "https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json";
let global_file = "global.json";
let global_url = "https://api.hearthstonejson.com/v1/strings/enUS/GLOBAL.json";
let etag_collection_file = "etag_collection.json";
let etag_cards_file = "etag_cards.txt";
let etag_global_file = "etag_global.txt";
let current_etag_cards, latest_etag_cards;
let current_etag_collections, current_etag_collection, latest_etag_collection;
let current_etag_global, latest_etag_global;
let collection, cards, global;
let missing = {total: {cards: {all: 0}, dust: {all: 0}, disenchant: {all: 0}}};
let owned = {total: {cards: {all: 0}, dust: {all: 0}, disenchant: {all: 0}, disenchant_all: {all: 0}}};
let total = {total: {cards: {all: 0}, dust: {all: 0}, disenchant: {all: 0}}};
let surplus = {total: {cards: [{all: 0},{all: 0},{all: 0},{all: 0}], dust: [{all: 0},{all: 0},{all: 0}]}};
let crafting_cost = [{FREE: 0, LEGENDARY: 1600, RARE: 100, COMMON: 40, EPIC: 400},{FREE: 0, LEGENDARY: 3200, RARE: 800, COMMON: 400, EPIC: 1600}];
let disenchanting_reward = [{FREE: 0, LEGENDARY: 400, RARE: 20, COMMON: 5, EPIC: 100},{FREE: 0, LEGENDARY: 1600, RARE: 100, COMMON: 50, EPIC: 400}];
let limits_by_rarity = {FREE: 2, COMMON: 2, RARE: 2, EPIC: 2, LEGENDARY: 1};
let limits_by_type = {HERO: 1, SPELL: 2, MINION: 2, WEAPON: 2};
const inquirer = require('inquirer');
let questions = [
    {
        name: 'account_lo',
        message: "What's your Account lo?"
    },
    {
        name: 'region',
        message: "What's your region? (1: US, 2: EU, 3: Asia, 5: China) "
    }
];

return fs.stat(cards_file)
    .then(stats => fs.readFile(etag_cards_file, {encoding: 'utf8'}).then(contents => current_etag_cards = contents))
    .catch(err => {})
    .then(() => got({url: cards_url, method: "HEAD"}))
    .then(response => {
        let headers = response.headers;
        if (headers && headers['etag']) {
            latest_etag_cards = headers['etag'].replace(/^.*\//,'');
            if (latest_etag_cards === current_etag_cards) return fs.readFile(cards_file, {encoding: 'utf8'});
            fs.writeFile(etag_cards_file, latest_etag_cards, {encoding: 'utf8'}, err => {
                if (err) console.log("Error saving new cards etag to file: ", err);
            });
        }
        return got({url: cards_url,method: "GET"}).then(response => {
            console.log("New cards file version downloaded");
            fs.writeFile(cards_file, response.body, {encoding: 'utf8'}, err => {
                if (err) console.log("Error saving new cards file: ", err);
            });
            return response.body;
        })
    })
    .then(contents => {
        cards = JSON.parse(contents);
        return fs.stat(global_file);
    })
    .then(stats => fs.readFile(etag_global_file, {encoding: 'utf8'}).then(contents => current_etag_global = contents))
    .catch(err => {})
    .then(() => got({url: global_url, method: "HEAD"}))
    .then(response => {
        let headers = response.headers;
        if (headers && headers['etag']) {
            latest_etag_global = headers['etag'].replace(/^.*\//,'');
            if (latest_etag_global === current_etag_global) return fs.readFile(global_file, {encoding: 'utf8'});
            fs.writeFile(etag_global_file, latest_etag_global, {encoding: 'utf8'}, err => {
                if (err) console.log("Error saving new global etag to file: ", err);
            });
        }
        return got({url: global_url, method: "GET"}).then(response => {
            console.log("New global file version downloaded");
            fs.writeFile(global_file, response.body, {encoding: 'utf8'}, err => {
                if (err) console.log("Error saving new global file: ", err);
            });
            return response.body;
        })
    })
    .then(contents => {
        global = JSON.parse(contents);
        return fs.readFile(etag_collection_file, {encoding: 'utf8'}).then(contents => current_etag_collections = JSON.parse(contents))
    })
    .catch(err => {})
    .then(() => {
        if (!current_etag_collections || !current_etag_collections.accounts || !current_etag_collections.accounts.length) return inquirer.prompt(questions);
        let choices = [];
        for (let i = 0; i < current_etag_collections.accounts.length; i++) {
            choices.push({name: "Region: " + current_etag_collections.accounts[i].region + ". Account: " + current_etag_collections.accounts[i].account_lo, value: i});
        }
        choices.push({name: "New", value: -1});
        return inquirer.prompt([{name: "account", message: "What account do you want to check?", type: 'list', choices: choices}]).then(choice => {
            if (choice.account === -1) return inquirer.prompt(questions);
            throw choice.account;
        });
    }).then(answers => {
        if (!current_etag_collections) current_etag_collections = {};
        if (!current_etag_collections.accounts) current_etag_collections.accounts = [];
        for (let i = 0; i < current_etag_collections.accounts.length; i++) {
            if (current_etag_collections.accounts[i].region === answers.region && current_etag_collections.accounts[i].account_lo === answers.account_lo) throw i;
        }
        current_etag_collections.accounts.push({region: answers.region, account_lo: answers.account_lo});
        return current_etag_collections.accounts.length - 1;
    })
    .catch(index => index)
    .then(index => {
        current_etag_collection = current_etag_collections.accounts[index];
        collection_file = sprintf(collection_file, current_etag_collection);
        return fs.stat(collection_file)
    })
    .catch(() => current_etag_collection.etag = undefined)
    .then(() => {
        return got({url: sprintf(collection_url, current_etag_collection),method: "GET",headers: {'If-None-Match': current_etag_collection.etag}}).then(response => {
            let headers = response.headers;
            if (response.statusCode === 304) return fs.readFile(collection_file, {encoding: 'utf8'});
            if (headers && headers['etag']) {
                latest_etag_collection = headers['etag'].replace(/^.*\//,'');
                if (latest_etag_collection !== current_etag_collection.etag) {
                    current_etag_collection.etag = latest_etag_collection;
                    fs.writeFile(etag_collection_file, JSON.stringify(current_etag_collections), {encoding: 'utf8'}, err => {
                        if (err) console.log("Error saving new collection etag to file: ", err);
                    });
                }
            }
            if (response.statusCode === 200 && response.body) {
                console.log("New collection file version downloaded");
                fs.writeFile(collection_file, response.body, {encoding: 'utf8'}, err => {
                    if (err) console.log("Error saving new collection file: ", err);
                });
                return response.body;
            }
        });
    })
    .then(contents => {
        cards = cards.reduce((obj, card) => {obj[card.dbfId] = card; return obj;}, {});
        collection = JSON.parse(contents);
        if (!collection.collection) throw "Invalid collection format";
        collection = collection.collection;
        for (let card_id in cards) {
            if (cards.hasOwnProperty(card_id)) {
                if (!limits_by_type.hasOwnProperty(cards[card_id].type)) limits_by_type[cards[card_id].type] = 2;
                if (!limits_by_rarity.hasOwnProperty(cards[card_id].rarity)) limits_by_rarity[cards[card_id].rarity] = 2;
                let limit = Math.min(limits_by_type[cards[card_id].type], limits_by_rarity[cards[card_id].rarity]);
                if (!missing.hasOwnProperty(cards[card_id].set)) {
                    missing[cards[card_id].set] = {cards: {all: 0}, dust: {all: 0}, disenchant: {all: 0}};
                    owned[cards[card_id].set] = {cards: {all: 0}, dust: {all: 0}, disenchant: {all: 0}, disenchant_all: {all: 0}};
                    total[cards[card_id].set] = {cards: {all: 0}, dust: {all: 0}, disenchant: {all: 0}};
                    surplus[cards[card_id].set] = {cards: [{all: 0},{all: 0},{all: 0},{all: 0}], dust: [{all: 0},{all: 0},{all: 0}]};
                }
                if (!missing[cards[card_id].set].cards.hasOwnProperty(cards[card_id].rarity)) {
                    missing[cards[card_id].set].cards[cards[card_id].rarity] = 0;
                    missing[cards[card_id].set].dust[cards[card_id].rarity] = 0;
                    missing[cards[card_id].set].disenchant[cards[card_id].rarity] = 0;
                    owned[cards[card_id].set].cards[cards[card_id].rarity] = 0;
                    owned[cards[card_id].set].dust[cards[card_id].rarity] = 0;
                    owned[cards[card_id].set].disenchant[cards[card_id].rarity] = 0;
                    owned[cards[card_id].set].disenchant_all[cards[card_id].rarity] = 0;
                    total[cards[card_id].set].cards[cards[card_id].rarity] = 0;
                    total[cards[card_id].set].dust[cards[card_id].rarity] = 0;
                    total[cards[card_id].set].disenchant[cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].cards[0][cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].cards[1][cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].cards[2][cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].cards[3][cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].dust[0][cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].dust[1][cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].dust[2][cards[card_id].rarity] = 0;
                }
                if (!missing.total.cards.hasOwnProperty(cards[card_id].rarity)) {
                    missing.total.cards[cards[card_id].rarity] = 0;
                    missing.total.dust[cards[card_id].rarity] = 0;
                    missing.total.disenchant[cards[card_id].rarity] = 0;
                    owned.total.cards[cards[card_id].rarity] = 0;
                    owned.total.dust[cards[card_id].rarity] = 0;
                    owned.total.disenchant[cards[card_id].rarity] = 0;
                    owned.total.disenchant_all[cards[card_id].rarity] = 0;
                    total.total.cards[cards[card_id].rarity] = 0;
                    total.total.dust[cards[card_id].rarity] = 0;
                    total.total.disenchant[cards[card_id].rarity] = 0;
                    surplus.total.cards[0][cards[card_id].rarity] = 0;
                    surplus.total.cards[1][cards[card_id].rarity] = 0;
                    surplus.total.cards[2][cards[card_id].rarity] = 0;
                    surplus.total.cards[3][cards[card_id].rarity] = 0;
                    surplus.total.dust[0][cards[card_id].rarity] = 0;
                    surplus.total.dust[1][cards[card_id].rarity] = 0;
                    surplus.total.dust[2][cards[card_id].rarity] = 0;
                }
                total.total.cards[cards[card_id].rarity] += limit;
                total.total.cards.all += limit;
                total.total.dust.all += limit * crafting_cost[0][cards[card_id].rarity];
                total.total.dust[cards[card_id].rarity] += limit * crafting_cost[0][cards[card_id].rarity];
                total[cards[card_id].set].cards[cards[card_id].rarity] += limit;
                total[cards[card_id].set].cards.all += limit;
                total[cards[card_id].set].dust.all += limit * crafting_cost[0][cards[card_id].rarity];
                total[cards[card_id].set].dust[cards[card_id].rarity] += limit * crafting_cost[0][cards[card_id].rarity];
                if (collection.hasOwnProperty(card_id)) {
                    let golden_amount = Math.min(collection[card_id][1], limit);
                    let normal_amount = Math.min(collection[card_id][0], limit);
                    if (golden_amount + normal_amount > limit) normal_amount = normal_amount > golden_amount ? normal_amount - golden_amount : 0;
                    let disenchant_all_reward = collection[card_id][0] * disenchanting_reward[0][cards[card_id].rarity] + collection[card_id][1] * disenchanting_reward[1][cards[card_id].rarity];
                    let disenchant_reward = normal_amount * disenchanting_reward[0][cards[card_id].rarity] + golden_amount * disenchanting_reward[1][cards[card_id].rarity];
                    owned.total.disenchant.all += disenchant_reward;
                    owned.total.disenchant[cards[card_id].rarity] += disenchant_reward;
                    owned[cards[card_id].set].disenchant.all += disenchant_reward;
                    owned[cards[card_id].set].disenchant[cards[card_id].rarity] += disenchant_reward;
                    owned.total.disenchant_all.all += disenchant_all_reward;
                    owned.total.disenchant_all[cards[card_id].rarity] += disenchant_all_reward;
                    owned[cards[card_id].set].disenchant_all.all += disenchant_all_reward;
                    owned[cards[card_id].set].disenchant_all[cards[card_id].rarity] += disenchant_all_reward;

                    total.total.disenchant.all += disenchant_reward;
                    total.total.disenchant[cards[card_id].rarity] += disenchant_reward;
                    total[cards[card_id].set].disenchant.all += disenchant_reward;
                    total[cards[card_id].set].disenchant[cards[card_id].rarity] += disenchant_reward;

                    let amount = collection[card_id][0] + collection[card_id][1];
                    if (amount < limit) {
                        owned.total.cards[cards[card_id].rarity] += amount;
                        owned.total.cards.all += amount;
                        owned.total.dust.all += amount * crafting_cost[0][cards[card_id].rarity];
                        owned.total.dust[cards[card_id].rarity] += amount * crafting_cost[0][cards[card_id].rarity];
                        owned[cards[card_id].set].cards[cards[card_id].rarity] += amount;
                        owned[cards[card_id].set].cards.all += amount;
                        owned[cards[card_id].set].dust.all += amount * crafting_cost[0][cards[card_id].rarity];
                        owned[cards[card_id].set].dust[cards[card_id].rarity] += amount * crafting_cost[0][cards[card_id].rarity];

                        disenchant_reward = (limit - amount) * disenchanting_reward[0][cards[card_id].rarity];
                        total.total.disenchant.all += disenchant_reward;
                        total.total.disenchant[cards[card_id].rarity] += disenchant_reward;
                        total[cards[card_id].set].disenchant.all += disenchant_reward;
                        total[cards[card_id].set].disenchant[cards[card_id].rarity] += disenchant_reward;

                        missing.total.cards[cards[card_id].rarity] += limit - amount;
                        missing.total.cards.all += limit - amount;
                        missing.total.dust.all += (limit - amount) * crafting_cost[0][cards[card_id].rarity];
                        missing.total.dust[cards[card_id].rarity] += (limit - amount) * crafting_cost[0][cards[card_id].rarity];
                        missing.total.disenchant.all += disenchant_reward;
                        missing.total.disenchant[cards[card_id].rarity] += disenchant_reward;
                        missing[cards[card_id].set].cards[cards[card_id].rarity] += limit - amount;
                        missing[cards[card_id].set].cards.all += limit - amount;
                        missing[cards[card_id].set].dust.all += (limit - amount) * crafting_cost[0][cards[card_id].rarity];
                        missing[cards[card_id].set].dust[cards[card_id].rarity] += (limit - amount) * crafting_cost[0][cards[card_id].rarity];
                        missing[cards[card_id].set].disenchant.all += disenchant_reward;
                        missing[cards[card_id].set].disenchant[cards[card_id].rarity] += disenchant_reward;
                    }
                    else {
                        owned.total.cards[cards[card_id].rarity] += limit;
                        owned.total.cards.all += limit;
                        owned.total.dust.all += limit * crafting_cost[0][cards[card_id].rarity];
                        owned.total.dust[cards[card_id].rarity] += limit * crafting_cost[0][cards[card_id].rarity];
                        owned[cards[card_id].set].cards[cards[card_id].rarity] += limit;
                        owned[cards[card_id].set].cards.all += limit;
                        owned[cards[card_id].set].dust.all += limit * crafting_cost[0][cards[card_id].rarity];
                        owned[cards[card_id].set].dust[cards[card_id].rarity] += limit * crafting_cost[0][cards[card_id].rarity];

                        if (amount > limit) {
                            let golden_excess = collection[card_id][1] > limit ? collection[card_id][1] - limit : 0;
                            surplus.total.cards[2][cards[card_id].rarity] += golden_excess;
                            surplus.total.cards[2].all += golden_excess;
                            surplus.total.dust[0][cards[card_id].rarity] += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus.total.dust[0].all += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus.total.dust[1][cards[card_id].rarity] += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus.total.dust[1].all += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus[cards[card_id].set].cards[2][cards[card_id].rarity] += golden_excess;
                            surplus[cards[card_id].set].cards[2].all += golden_excess;
                            surplus[cards[card_id].set].dust[0][cards[card_id].rarity] += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[0].all += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[1][cards[card_id].rarity] += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[1].all += golden_excess * disenchanting_reward[1][cards[card_id].rarity];

                            let normal_excess = collection[card_id][0] > limit ? collection[card_id][0] - limit : 0;
                            surplus.total.cards[0][cards[card_id].rarity] += normal_excess;
                            surplus.total.cards[0].all += normal_excess;
                            surplus.total.dust[0][cards[card_id].rarity] += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus.total.dust[0].all += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus.total.dust[2][cards[card_id].rarity] += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus.total.dust[2].all += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus[cards[card_id].set].cards[0][cards[card_id].rarity] += normal_excess;
                            surplus[cards[card_id].set].cards[0].all += normal_excess;
                            surplus[cards[card_id].set].dust[0][cards[card_id].rarity] += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[0].all += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[2][cards[card_id].rarity] += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[2].all += normal_excess * disenchanting_reward[0][cards[card_id].rarity];

                            normal_excess += Math.min(collection[card_id][0], collection[card_id][1], limit);
                            surplus.total.cards[1][cards[card_id].rarity] += normal_excess;
                            surplus.total.cards[1].all += normal_excess;
                            surplus.total.dust[1][cards[card_id].rarity] += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus.total.dust[1].all += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus[cards[card_id].set].cards[1][cards[card_id].rarity] += normal_excess;
                            surplus[cards[card_id].set].cards[1].all += normal_excess;
                            surplus[cards[card_id].set].dust[1][cards[card_id].rarity] += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[1].all += normal_excess * disenchanting_reward[0][cards[card_id].rarity];

                            golden_excess += Math.min(collection[card_id][0], collection[card_id][1], limit);
                            surplus.total.cards[3][cards[card_id].rarity] += golden_excess;
                            surplus.total.cards[3].all += golden_excess;
                            surplus.total.dust[2][cards[card_id].rarity] += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus.total.dust[2].all += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus[cards[card_id].set].cards[3][cards[card_id].rarity] += golden_excess;
                            surplus[cards[card_id].set].cards[3].all += golden_excess;
                            surplus[cards[card_id].set].dust[2][cards[card_id].rarity] += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                            surplus[cards[card_id].set].dust[2].all += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                        }
                    }
                }
                else {
                    total.total.disenchant.all += limit * disenchanting_reward[0][cards[card_id].rarity];
                    total.total.disenchant[cards[card_id].rarity] += limit * disenchanting_reward[0][cards[card_id].rarity];
                    total[cards[card_id].set].disenchant.all += limit * disenchanting_reward[0][cards[card_id].rarity];
                    total[cards[card_id].set].disenchant[cards[card_id].rarity] += limit * disenchanting_reward[0][cards[card_id].rarity];
                    missing.total.cards[cards[card_id].rarity] += limit;
                    missing.total.cards.all += limit;
                    missing.total.dust.all += limit * crafting_cost[0][cards[card_id].rarity];
                    missing.total.dust[cards[card_id].rarity] += limit * crafting_cost[0][cards[card_id].rarity];
                    missing.total.disenchant.all += limit * disenchanting_reward[0][cards[card_id].rarity];
                    missing.total.disenchant[cards[card_id].rarity] += limit * disenchanting_reward[0][cards[card_id].rarity];
                    missing[cards[card_id].set].cards[cards[card_id].rarity] += limit;
                    missing[cards[card_id].set].cards.all += limit;
                    missing[cards[card_id].set].dust.all += limit * crafting_cost[0][cards[card_id].rarity];
                    missing[cards[card_id].set].dust[cards[card_id].rarity] += limit * crafting_cost[0][cards[card_id].rarity];
                    missing[cards[card_id].set].disenchant.all += limit * disenchanting_reward[0][cards[card_id].rarity];
                    missing[cards[card_id].set].disenchant[cards[card_id].rarity] += limit * disenchanting_reward[0][cards[card_id].rarity];
                }
            }
        }
        for (let card_id in collection) {
            if (collection.hasOwnProperty(card_id) && !cards.hasOwnProperty(card_id)) console.log("Card ID " + card_id + " is not in cards DB");
        }

        for (let set in missing) {
            if (missing.hasOwnProperty(set)) {
                if (global.hasOwnProperty("GLOBAL_CARD_SET_" + set)) process.stdout.write(global["GLOBAL_CARD_SET_" + set]);
                else process.stdout.write(set);
                process.stdout.write(":\n");
                for (let rarity in limits_by_rarity) {
                    process.stdout.write(rarity + ": ");
                    if (owned[set].cards.hasOwnProperty(rarity)) process.stdout.write(owned[set].cards[rarity] + "");
                    else process.stdout.write("0");

                    process.stdout.write("/");

                    if (total[set].cards.hasOwnProperty(rarity)) process.stdout.write(total[set].cards[rarity] + "");
                    else process.stdout.write("0");

                    process.stdout.write("\r\t\t\t");

                    if (missing[set].cards[rarity]) process.stdout.write("Missing " + missing[set].cards[rarity]);
                    else process.stdout.write("Complete!");

                    process.stdout.write("\r\t\t\t\t\t");

                    process.stdout.write("Cost: ");
                    if (owned[set].dust.hasOwnProperty(rarity)) process.stdout.write(owned[set].dust[rarity] + "");
                    else process.stdout.write("0");
                    process.stdout.write("/");
                    if (total[set].dust.hasOwnProperty(rarity)) process.stdout.write(total[set].dust[rarity] + "");
                    else process.stdout.write("0");

                    process.stdout.write("\r\t\t\t\t\t\t\t\t");

                    if (missing[set].dust[rarity]) process.stdout.write("Missing " + missing[set].dust[rarity] + "");
                    else process.stdout.write("Complete!");

                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t");

                    if (surplus[set].cards[0].hasOwnProperty(rarity)) process.stdout.write("Surplus: Normal +" + surplus[set].cards[0][rarity]);
                    else process.stdout.write("Surplus: Normal +0");
                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t");
                    if (surplus[set].cards[1].hasOwnProperty(rarity)) process.stdout.write("Normal* +" + surplus[set].cards[1][rarity]);
                    else process.stdout.write("Normal* +0");
                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                    if (surplus[set].cards[2].hasOwnProperty(rarity)) process.stdout.write("Golden +" + surplus[set].cards[2][rarity]);
                    else process.stdout.write("Golden +0");
                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                    if (surplus[set].cards[3].hasOwnProperty(rarity)) process.stdout.write("Golden^ +" + surplus[set].cards[3][rarity]);
                    else process.stdout.write("Golden^ +0");
                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                    if (surplus[set].dust[0].hasOwnProperty(rarity)) process.stdout.write("Dust +" + surplus[set].dust[0][rarity]);
                    else process.stdout.write("Dust +0");
                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                    if (surplus[set].dust[1].hasOwnProperty(rarity)) process.stdout.write("Dust* +" + surplus[set].dust[1][rarity]);
                    else process.stdout.write("Dust* +0");
                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                    if (surplus[set].dust[2].hasOwnProperty(rarity)) process.stdout.write("Dust^ +" + surplus[set].dust[2][rarity]);
                    else process.stdout.write("Dust^ +0");

                    process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");

                    process.stdout.write("Sell: ");
                    if (owned[set].disenchant.hasOwnProperty(rarity)) process.stdout.write(owned[set].disenchant[rarity] + "");
                    else process.stdout.write("0");
                    if (owned[set].disenchant_all.hasOwnProperty(rarity)) process.stdout.write(" (" + owned[set].disenchant_all[rarity] + ")");
                    else process.stdout.write(" (0)");
                    process.stdout.write("/");
                    if (total[set].disenchant.hasOwnProperty(rarity)) process.stdout.write(total[set].disenchant[rarity] + "");
                    else process.stdout.write("0");
                    if (missing[set].disenchant.hasOwnProperty(rarity)) process.stdout.write(" (" + missing[set].disenchant[rarity] + ")");
                    else process.stdout.write(" (0)");

                    process.stdout.write("\n");
                }
                process.stdout.write("OVERALL: ");
                if (owned[set].cards.all) process.stdout.write(owned[set].cards.all + "");
                else process.stdout.write("0");

                process.stdout.write("/");

                if (total[set].cards.all) process.stdout.write(total[set].cards.all + "");
                else process.stdout.write("0");
                process.stdout.write("\r\t\t\t");

                if (missing[set].cards.all) process.stdout.write("Missing " + missing[set].cards.all);
                else process.stdout.write("Complete!");


                process.stdout.write("\r\t\t\t\t\t");
                process.stdout.write("Cost: " + owned[set].dust.all);
                process.stdout.write("/" + total[set].dust.all);
                process.stdout.write("\r\t\t\t\t\t\t\t\t");
                if (missing[set].dust.all) process.stdout.write("Missing " + missing[set].dust.all);
                else process.stdout.write("Complete!");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t");
                if (surplus[set].cards[0].all) process.stdout.write("Surplus: Normal +" + surplus[set].cards[0].all);
                else process.stdout.write("Surplus: Normal +0");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t");
                if (surplus[set].cards[1].all) process.stdout.write("Normal* +" + surplus[set].cards[1].all);
                else process.stdout.write("Normal* +0");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                if (surplus[set].cards[2].all) process.stdout.write("Golden +" + surplus[set].cards[2].all);
                else process.stdout.write("Golden +0");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                if (surplus[set].cards[3].all) process.stdout.write("Golden^ +" + surplus[set].cards[3].all);
                else process.stdout.write("Golden^ +0");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                if (surplus[set].dust[0].all) process.stdout.write("Dust +" + surplus[set].dust[0].all);
                else process.stdout.write("Dust +0");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                if (surplus[set].dust[1].all) process.stdout.write("Dust* +" + surplus[set].dust[1].all);
                else process.stdout.write("Dust* +0");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                if (surplus[set].dust[2].all) process.stdout.write("Dust^ +" + surplus[set].dust[2].all);
                else process.stdout.write("Dust^ +0");
                process.stdout.write("\r\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t");
                process.stdout.write("Sell: " + owned[set].disenchant.all);
                process.stdout.write(" (" + owned[set].disenchant_all.all + ")");
                process.stdout.write("/" + total[set].disenchant.all);
                process.stdout.write(" (" + missing[set].disenchant.all + ")");
                process.stdout.write("\n\n");
            }
        }
    })
    .catch(err => console.log("Error: ", err));