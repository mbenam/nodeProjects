function pdf(x) {
	return (1.0 / Math.sqrt(2.0*Math.PI)) * Math.exp(-0.5*x*x)
}

function calcCallGammaEx(S, K, vol, T, r, q, OI) {
	if ((T == 0) || (vol == 0)) {
		return 0.0;
	}
	var dp = (Math.log(S/K) + (r-q+0.5*Math.pow(vol, 2))*T) / (vol * Math.sqrt(T));

    var gamma = Math.exp(-q*T) * pdf(dp) / (S * vol * Math.sqrt(T));
    return OI * 100.0 * S * S * 0.01 * gamma;

}

function calcPutGammaEx(S, K, vol, T, r, q, OI) {
	if ((T == 0) || (vol == 0)) {
		return 0.0;
	}
	var dp = (Math.log(S/K) + (r-q+0.5*Math.pow(vol, 2))*T) / (vol * Math.sqrt(T));
	var dm = dp - vol*Math.sqrt(T);

	var gamma = K * Math.exp(r*T) * pdf(dm) / (S * S * vol * Math.sqrt(T));
	return OI * 100.0 * S * S * 0.01 * gamma;

}

function splitOptions(s) {
    let strike = s.slice(-8);
    let putCall = s.slice(-9,-8);
    let oneDay = 1000 * 60 * 60 * 24;
    let expDate = s.slice(-15,-9);
    let daysTillExp = Math.round((new Date('20' + expDate.slice(0,2) + '-' + expDate.slice(2,4) + '-' + expDate.slice(4,6)) - Date.now())/oneDay);
    if (daysTillExp < 1) {
        daysTillExp = 1;
    }

    daysTillExp = daysTillExp%7 != 6 ? Math.floor(daysTillExp/7)*5 + daysTillExp%7 : Math.floor(daysTillExp/7)*5 + 5;
    return {"expDate": parseInt(expDate), "daysTillExp":parseFloat(daysTillExp)/252.0, "strike": parseFloat(strike)/1000.0, "putCall": putCall};
}

function getCallsPuts(optionsList){
    var optList = new Array();

    optionsList.forEach(option => {
        var a = splitOptions(option["option"]);
        a["gamma"] = parseFloat(option["gamma"]);
        a["open_interest"] = parseFloat(option["open_interest"]);
        a["IV"] = parseFloat(option["iv"]);
        optList.push(a);
        
    });

    return optList;

}

function getLevels(spotPrice){
    let fromStrike = 0.8 * spotPrice;
    let toStrike = 1.2 * spotPrice;
    let steps = 60.0;
    let inc = (toStrike - fromStrike)/steps;
    let levels = new Array();
    var i = fromStrike;
    levels.push(fromStrike);

    while (i < toStrike) {
        i += inc;
        levels.push(i);
    }
    levels.push(toStrike);

    return levels;

}

function getTotalGamma(optList, spotPrice){
    var totalGamma = 0.0;
    var strikeCalls = new Map();
    var strikePuts = new Map();
    var expDateGEX = new Map();

    optList.forEach(option => {
        let b = parseFloat(option["gamma"])*parseFloat(option["open_interest"]) * 100 * spotPrice * spotPrice * 0.01/1000000000.0;
        if (option["putCall"] == 'C') {
            totalGamma += b;
            if (strikeCalls.has(option["strike"])) {
                strikeCalls.set(option["strike"], strikeCalls.get(option["strike"]) + b);
            } else {
                strikeCalls.set(option["strike"], 0.0);
                strikeCalls.set(option["strike"], strikeCalls.get(option["strike"]) + b);
            }

            if (expDateGEX.has(option["expDate"])) {
                expDateGEX.set(option["expDate"], expDateGEX.get(option["expDate"]) + b);
            } else {
                expDateGEX.set(option["expDate"], 0.0);
                expDateGEX.set(option["expDate"], expDateGEX.get(option["expDate"]) + b);
            }

        } else {
            totalGamma -= b;
            if (strikePuts.has(option["strike"])) {
                strikePuts.set(option["strike"], strikePuts.get(option["strike"]) + b);
            } else {
                strikePuts.set(option["strike"], 0.0);
                strikePuts.set(option["strike"], strikePuts.get(option["strike"]) + b);
            }

            if (expDateGEX.has(option["expDate"])) {
                expDateGEX.set(option["expDate"], expDateGEX.get(option["expDate"]) - b);
            } else {
                expDateGEX.set(option["expDate"], 0.0);
                expDateGEX.set(option["expDate"], expDateGEX.get(option["expDate"]) - b);
            }


        }
    
    });
    
    totalGamma = +(totalGamma).toFixed(3);
    
    return {"totalGamma": totalGamma, 'strikeCalls': strikeCalls, 'strikePuts': strikePuts, 'expDateGEX': expDateGEX};

}

function getPutCallWall(strikeCalls, strikePuts, spotPrice){

    var callMapDesc = new Map([...strikeCalls].sort((a, b) => b[1] - a[1]));
    var putMapDesc = new Map([...strikePuts].sort((a, b) => b[1] - a[1]));
    let putWall = 0.0;
    let callWall = 0.0;

    for (let [key, value] of putMapDesc) {
        if (key > spotPrice) {
            continue;
        } else {
            putWall = key;
            break;
        }
    }

    for (let [key, value] of callMapDesc) {
        if (key < spotPrice) {
            continue;
        } else {
            callWall = key;
            break;
        }
    }

    // let putWall = putMapDesc.keys().next().value;
    // let callWall = callMapDesc.keys().next().value;

    return {"putWall": putWall, "callWall": callWall}

}

function getGammaFlip(optList, spotPrice){

    let levels = getLevels(spotPrice);

    var levelGEX = new Map();

    levels.forEach(level => {
        var tGEX = 0.0;
        optList.forEach(option => {
            if (option["putCall"] == 'C') {
                var a = calcCallGammaEx(level, option["strike"], option["IV"], option["daysTillExp"], 0.0, 0.0, option["open_interest"]);
                tGEX = tGEX + a;
            } else {
                var a = calcPutGammaEx(level, option["strike"], option["IV"], option["daysTillExp"], 0.0, 0.0, option["open_interest"]);
                tGEX = tGEX - a;
            }     
        });
        
        levelGEX.set(level, tGEX/1000000000.0);
    
    });
    var strike1 = 0.0;
    var strike2 = 0.0;
    var gamma1 = -1.0;
    var gamma2 = 0.0;

    for (let [key, value] of levelGEX) {
        if (value < 0.0) {
            strike1 = key;
            gamma1 = value;
        } else {
            strike2 = key;
            gamma2 = value;
            break;
        }
    }

    let gFlip = strike1 + (strike2-strike1)/(gamma2 - gamma1) * (-gamma1);

    return {'gammaFlip': parseInt(gFlip)};
    
    
}

function getExpiryGamma(expDateGEX){
    var expDateGEXAsc = new Map([...expDateGEX].sort((a, b) => a[0] - b[0]));
    var expGamma = {};
    expDateGEXAsc.forEach((value, key) => {
        let expDate = key.toString();
        let a = '20' + expDate.slice(0,2) + '-' + expDate.slice(2,4) + '-' + expDate.slice(4,6);
        expGamma[a] = +value.toFixed(3);
    })

    return expGamma;
}

// let rawdata = fs.readFileSync('stock.json').toString();
// var jString = JSON.parse(rawdata);
// console.log(getGamma(jString));

function getAllExpGamma(expDateGEX){
    
    let expiries = getExpiryGamma(expDateGEX);
    var id = 0;
    var s = '';
    for (const [key, value] of Object.entries(expiries)) {
        if (monthlies.includes(key)) {
            id = monthlies.indexOf(key);
            break;
        } else {
            s += `${key}: ${value}\n`;
        }
        
    }

    for (let i = id; i < monthlies.length; i++) {
        s += `\x1b[33;1m${monthlies[i]}: ${expiries[monthlies[i]]} \x1b[0m\n`;
    }

    return s;
}

function getNextExpGamma(expDateGEX){
    let expiries = getExpiryGamma(expDateGEX);
    for (const [key, value] of Object.entries(expiries)) {
        if (monthlies.includes(key)) {
            return {'nextExpGamma': value};
        }
    }

}

async function getSpotPriceOptions(ticker){

    const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${ticker.toUpperCase()}.json`);
    const json = await res.json();
    let spotPrice = json["data"]["current_price"];
    let optList = getCallsPuts(json["data"]["options"]);
    return {'spotPrice': spotPrice, 'optList': optList};
    
}

// let now = Date.now();

let monthlies = ['2022-09-16', '2022-10-21', '2022-11-18', '2022-12-16'];

var b = await getSpotPriceOptions('_spx');


b = {...b, ...getTotalGamma(b['optList'], b['spotPrice'])};

b = {...b, ...getGammaFlip(b['optList'], b['spotPrice'])};

b = {...b, ...getPutCallWall(b['strikeCalls'], b['strikePuts'], b['spotPrice'])};

b = {...b, ...getNextExpGamma(b['expDateGEX'])};

// console.log(Object.keys(b));

// console.log(b['expDateGEX']);

// console.log((Date.now() - now)/1000.0);