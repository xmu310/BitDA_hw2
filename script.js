const chartColors = {
    ratio: 'rgba(88, 166, 255, 1)',
    ratioBg: 'rgba(88, 166, 255, 0.1)',
    sma: 'rgba(248, 81, 73, 1)',
    mstr: 'rgba(63, 185, 80, 1)',
    btc: 'rgba(242, 204, 143, 1)',
    grid: 'rgba(48, 54, 61, 0.5)',
    text: '#8b949e'
};

let latestDataPayload = "";

function processYahooData(data) {
    const result = data.chart.result[0];
    const dict = {};
    result.timestamp.forEach((ts, i) => {
        const close = result.indicators.quote[0].close[i];
        if (close !== null) {
            dict[new Date(ts * 1000).toISOString().split('T')[0]] = close;
        }
    });
    return dict;
}

async function fetchTicker(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    const proxyUrl1 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    try {
        const res = await fetch(proxyUrl1);
        if (!res.ok) throw new Error('Primary proxy failed');
        const data = await res.json();
        return processYahooData(data);
    } catch (err) {
        const proxyUrl2 = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const res2 = await fetch(proxyUrl2);
        const data2 = await res2.json();
        const parsedData = JSON.parse(data2.contents);
        return processYahooData(parsedData);
    }
}

function calcReturns(prices) {
    const returns =[];
    for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    return returns;
}

function pearson(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, val, i) => acc + val * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const sumY2 = y.reduce((a, b) => a + b * b, 0);
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
}

async function initDashboard() {
    try {
        const mstrDict = await fetchTicker('MSTR');
        const btcDict = await fetchTicker('BTC-USD');
        
        const dates = Object.keys(mstrDict).sort();
        const validDates =[];
        const ratioData =[];
        const mstrPrices =[];
        const btcPrices =[];
        const historyForAI =[];

        dates.forEach(d => {
            if (btcDict[d]) {
                const ratio = mstrDict[d] / btcDict[d];
                validDates.push(d);
                ratioData.push(ratio);
                mstrPrices.push(mstrDict[d]);
                btcPrices.push(btcDict[d]);
                historyForAI.push(`${d}: ${ratio.toFixed(6)}`);
            }
        });

        latestDataPayload = historyForAI.slice(-7).join('\n');

        const sma30 =[];
        for (let i = 0; i < ratioData.length; i++) {
            if (i < 29) {
                sma30.push(null);
            } else {
                const slice = ratioData.slice(i - 29, i + 1);
                sma30.push(slice.reduce((a, b) => a + b, 0) / 30);
            }
        }

        const normMstr = mstrPrices.map(p => (p / mstrPrices[0]) * 100);
        const normBtc = btcPrices.map(p => (p / btcPrices[0]) * 100);

        const last30Ratios = ratioData.slice(-30);
        const latestRatio = ratioData[ratioData.length - 1];
        const high30 = Math.max(...last30Ratios);
        const low30 = Math.min(...last30Ratios);

        const mstrRet30 = calcReturns(mstrPrices.slice(-31));
        const btcRet30 = calcReturns(btcPrices.slice(-31));
        const corr30 = pearson(mstrRet30, btcRet30);

        document.getElementById('val-latest-ratio').innerText = latestRatio.toFixed(5);
        document.getElementById('val-30d-high').innerText = high30.toFixed(5);
        document.getElementById('val-30d-low').innerText = low30.toFixed(5);
        document.getElementById('val-correlation').innerText = corr30.toFixed(3);

        renderMainChart(validDates, ratioData, sma30);
        renderSubChart(validDates, normMstr, normBtc);

        const btn = document.getElementById('btn-analyze');
        btn.disabled = false;
        btn.innerText = "Request AI Analysis";
        
        requestAISummary();

    } catch (err) {
        document.getElementById('ai-content').innerText = "Failed to load data for analysis.";
    }
}

async function requestAISummary() {
    const btn = document.getElementById('btn-analyze');
    const content = document.getElementById('ai-content');
    
    btn.disabled = true;
    btn.innerText = "Processing...";
    content.innerHTML = "<i>Analyzing market structure via Gemini AI...</i>";

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: latestDataPayload })
        });

        if (!res.ok) throw new Error("API request failed");
        
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        content.innerHTML = data.summary.replace(/\n/g, '<br>');
        btn.innerText = "Analysis Complete";
    } catch (err) {
        content.innerHTML = `<span class="text-red">AI Analysis Error: Ensure GEMINI_API_KEY is set in Vercel.</span>`;
        btn.innerText = "Retry Analysis";
        btn.disabled = false;
    }
}

function getChartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { labels: { color: chartColors.text } },
            title: { display: true, text: title, color: chartColors.text, font: { size: 16 } }
        },
        scales: {
            x: { grid: { color: chartColors.grid }, ticks: { color: chartColors.text } },
            y: { grid: { color: chartColors.grid }, ticks: { color: chartColors.text } }
        }
    };
}

function renderMainChart(labels, ratio, sma) {
    new Chart(document.getElementById('ratioChart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets:[
                {
                    label: 'MSTR/BTC Ratio',
                    data: ratio,
                    borderColor: chartColors.ratio,
                    backgroundColor: chartColors.ratioBg,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: '30-Day SMA',
                    data: sma,
                    borderColor: chartColors.sma,
                    borderWidth: 2,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    fill: false
                }
            ]
        },
        options: getChartOptions('MSTR/BTC Relative Premium Proxy & 30D SMA')
    });
}

function renderSubChart(labels, mstr, btc) {
    new Chart(document.getElementById('perfChart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets:[
                {
                    label: 'MSTR Normalized Perf (Base 100)',
                    data: mstr,
                    borderColor: chartColors.mstr,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'BTC Normalized Perf (Base 100)',
                    data: btc,
                    borderColor: chartColors.btc,
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: getChartOptions('1-Year Normalized Performance Comparison')
    });
}

window.onload = initDashboard;