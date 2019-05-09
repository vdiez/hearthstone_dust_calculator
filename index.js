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
let missing = {total: {cards: {}, dust: 0}};
let owned = {total: {cards: {}, dust: 0}};
let surplus = {total: {cards: [{},{}], dust: 0}};
let total = {total: {cards: {}, dust: 0}};
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
                    missing[cards[card_id].set] = {cards: {}, dust: 0};
                    owned[cards[card_id].set] = {cards: {}, dust: 0};
                    total[cards[card_id].set] = {cards: {}, dust: 0};
                    surplus[cards[card_id].set] = {cards: [{},{}], dust: 0};
                }
                if (!missing[cards[card_id].set].cards.hasOwnProperty(cards[card_id].rarity)) {
                    missing[cards[card_id].set].cards[cards[card_id].rarity] = 0;
                    owned[cards[card_id].set].cards[cards[card_id].rarity] = 0;
                    total[cards[card_id].set].cards[cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].cards[0][cards[card_id].rarity] = 0;
                    surplus[cards[card_id].set].cards[1][cards[card_id].rarity] = 0;
                }
                if (!missing.total.cards.hasOwnProperty(cards[card_id].rarity)) {
                    missing.total.cards[cards[card_id].rarity] = 0;
                    owned.total.cards[cards[card_id].rarity] = 0;
                    total.total.cards[cards[card_id].rarity] = 0;
                    surplus.total.cards[0][cards[card_id].rarity] = 0;
                    surplus.total.cards[1][cards[card_id].rarity] = 0;
                }
                total.total.cards[cards[card_id].rarity] += limit;
                total.total.dust += limit * crafting_cost[0][cards[card_id].rarity];
                total[cards[card_id].set].cards[cards[card_id].rarity] += limit;
                total[cards[card_id].set].dust += limit * crafting_cost[0][cards[card_id].rarity];
                if (collection.hasOwnProperty(card_id)) {
                    let total = collection[card_id][0] + collection[card_id][1];
                    if (total < limit) {
                        owned.total.cards[cards[card_id].rarity] += total;
                        owned.total.dust += total * crafting_cost[0][cards[card_id].rarity];
                        owned[cards[card_id].set].cards[cards[card_id].rarity] += total;
                        owned[cards[card_id].set].dust += total * crafting_cost[0][cards[card_id].rarity];
                        missing.total.cards[cards[card_id].rarity] += limit - total;
                        missing.total.dust += (limit - total) * crafting_cost[0][cards[card_id].rarity];
                        missing[cards[card_id].set].cards[cards[card_id].rarity] += limit - total;
                        missing[cards[card_id].set].dust += (limit - total) * crafting_cost[0][cards[card_id].rarity];
                    }
                    else {
                        owned.total.cards[cards[card_id].rarity] += limit;
                        owned.total.dust += limit * crafting_cost[0][cards[card_id].rarity];
                        owned[cards[card_id].set].cards[cards[card_id].rarity] += limit;
                        owned[cards[card_id].set].dust += limit * crafting_cost[0][cards[card_id].rarity];
                        let golden_excess = collection[card_id][1] > limit ? collection[card_id][1] - limit : 0;
                        surplus.total.cards[1][cards[card_id].rarity] += golden_excess;
                        surplus.total.dust += golden_excess * disenchanting_reward[1][cards[card_id].rarity];
                        surplus[cards[card_id].set].cards[1][cards[card_id].rarity] += golden_excess;
                        surplus[cards[card_id].set].dust += golden_excess * disenchanting_reward[1][cards[card_id].rarity];

                        let normal_excess = collection[card_id][0] > limit ? collection[card_id][0] - limit : 0;
                        //normal_excess += collection[card_id][1] > limit ? limit : collection[card_id][1];
                        surplus.total.cards[0][cards[card_id].rarity] += normal_excess;
                        surplus.total.dust += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                        surplus[cards[card_id].set].cards[0][cards[card_id].rarity] += normal_excess;
                        surplus[cards[card_id].set].dust += normal_excess * disenchanting_reward[0][cards[card_id].rarity];
                    }
                }
                else {
                    missing.total.cards[cards[card_id].rarity] += limit;
                    missing.total.dust += limit * crafting_cost[0][cards[card_id].rarity];
                    missing[cards[card_id].set].cards[cards[card_id].rarity] += limit;
                    missing[cards[card_id].set].dust += limit * crafting_cost[0][cards[card_id].rarity];
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
                    if (owned[set].cards.hasOwnProperty(rarity)) process.stdout.write(owned[set].cards[rarity] + "/");
                    else process.stdout.write("0/");
                    if (total[set].cards.hasOwnProperty(rarity)) process.stdout.write(total[set].cards[rarity] + " ");
                    else process.stdout.write("0 ");
                    if (missing[set].cards.hasOwnProperty(rarity)) process.stdout.write("(Missing " + missing[set].cards[rarity] + ");\t");
                    else process.stdout.write("(Complete!);\t");
                    if (surplus[set].cards[0].hasOwnProperty(rarity)) process.stdout.write("Surplus (+" + surplus[set].cards[0][rarity] + " ");
                    else process.stdout.write("(+0 ");
                    if (surplus[set].cards[1].hasOwnProperty(rarity)) process.stdout.write("+" + surplus[set].cards[1][rarity] + ")\n");
                    else process.stdout.write("+0)\n");
                }
                process.stdout.write("Cost: " + owned[set].dust);
                process.stdout.write("/" + total[set].dust);
                process.stdout.write(" (" + missing[set].dust + ")\t\t");
                process.stdout.write("Surplus: " + surplus[set].dust + "\n\n");
            }
        }
    })
    .catch(err => console.log("Error: ", err));