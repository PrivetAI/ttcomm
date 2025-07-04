#!/usr/bin/env node

require('dotenv').config();
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise(resolve => {
        rl.question(question, resolve);
    });
}

async function runBot() {
    console.log('🤖 TikTok AI Commenter Bot');
    console.log('=' .repeat(50));
    
    // Выбор типа ленты
    console.log('\nВыберите тип ленты:');
    console.log('1. Общая лента (For You)');
    console.log('2. По хештегам');
    
    const feedChoice = await askQuestion('\nВаш выбор (1 или 2): ');
    
    let args = ['src/bot.js'];
    
    if (feedChoice === '2') {
        const hashtags = await askQuestion('Введите хештеги через запятую (например: #работа,#вакансии): ');
        args.push('--hashtag', hashtags);
    }
    
    rl.close();
    
    // Запуск бота
    console.log('\n🚀 Запуск бота...');
    console.log('Для остановки нажмите Ctrl+C\n');
    
    require('child_process').spawn('node', args, {
        stdio: 'inherit'
    });
}

runBot().catch(console.error);