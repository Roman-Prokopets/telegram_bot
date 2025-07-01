// bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const express = require('express'); // Импортируем Express.js

// Ваш токен бота
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('Ошибка: Токен бота не установлен в переменной окружения TELEGRAM_BOT_TOKEN.');
    process.exit(1);
}

// *** ИЗМЕНЕНИЕ 1: Убираем polling: true ***
const bot = new TelegramBot(token); // Больше не указываем polling

// Определяем порт, который будет слушать наш веб-сервер.
// Render.com предоставляет порт через переменную окружения PORT.
const PORT = process.env.PORT || 3000;
// URL для вебхуков. Render предоставит публичный URL для вашего сервиса.
// Вам нужно будет установить его как переменную окружения на Render.com (например, WEBHOOK_URL).
// Пример: https://your-service-name.onrender.com
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!WEBHOOK_URL) {
    console.error('Ошибка: Переменная окружения WEBHOOK_URL не установлена. Webhooks не будут работать.');
    console.error('Убедитесь, что вы добавили WEBHOOK_URL в Environment Variables на Render.com.');
    process.exit(1);
}

// Создаем Express приложение
const app = express();
app.use(express.json()); // Для парсинга JSON-тел запросов от Telegram

// *** ИЗМЕНЕНИЕ 2: Обработка входящих вебхуков ***
// Telegram будет отправлять обновления на этот URL
app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body); // Обрабатываем входящее обновление
    res.sendStatus(200); // Отправляем успешный ответ Telegram
});

// Добавьте простой маршрут для проверки работоспособности (опционально)
app.get('/', (req, res) => {
    res.send('Telegram bot webhook server is running!');
});

// Определяем путь к файлу, где будем хранить расписание
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');

// Переменная для хранения ID чата пользователя, которому нужно отправлять уведомления.
let adminChatId = process.env.TELEGRAM_CHAT_ID;

// --- Вспомогательные функции для работы с файлом расписания ---
function readSchedule() { /* ... код без изменений ... */
    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            const data = fs.readFileSync(SCHEDULE_FILE, 'utf8');
            return data ? JSON.parse(data) : [];
        }
        return [];
    } catch (error) {
        console.error('Ошибка при чтении файла расписания:', error);
        return [];
    }
}
function writeSchedule(scheduleData) { /* ... код без изменений ... */
    try {
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduleData, null, 2), 'utf8');
    } catch (error) {
        console.error('Ошибка при записи файла расписания:', error);
    }
}

// --- Функции для планирования уведомлений ---
function clearAllScheduledJobs() { /* ... код без изменений ... */
    for (const jobName in schedule.scheduledJobs) {
        schedule.scheduledJobs[jobName].cancel();
    }
    console.log('Все запланированные задачи очищены.');
}
function scheduleAllNotifications() { /* ... код без изменений ... */
    clearAllScheduledJobs();

    const currentSchedule = readSchedule();
    if (currentSchedule.length === 0) {
        console.log('Расписание пусто. Нет задач для планирования.');
        return;
    }

    const dayToNumberMap = {
        'понедельник': 1, 'пн': 1, 'mon': 1, 'monday': 1,
        'вторник': 2, 'вт': 2, 'вівторок': 2, 'втр': 2, 'tue': 2, 'tuesday': 2,
        'среда': 3, 'ср': 3, 'середа': 3, 'wed': 3, 'wednesday': 3,
        'четверг': 4, 'чт': 4, 'четвер': 4, 'thu': 4, 'thursday': 4,
        'пятница': 5, 'пт': 5, 'п\'ятниця': 5, 'fri': 5, 'friday': 5,
        'суббота': 6, 'сб': 6, 'субота': 6, 'sat': 6, 'saturday': 6,
        'воскресенье': 0, 'вс': 0, 'неділя': 0, 'sun': 0, 'sunday': 0,
    };

    currentSchedule.forEach((event, index) => {
        if (!adminChatId) {
            console.warn(`adminChatId не установлен для события "${event.description}". Уведомление не будет отправлено.`);
            return;
        }

        const dayOfWeek = dayToNumberMap[event.day.toLowerCase()];
        const [hour, minute] = event.time.split('.').map(Number);

        if (dayOfWeek === undefined || isNaN(hour) || isNaN(minute)) {
            console.error(`Неверный формат времени или дня недели для события: ${event.description}. Пропускаем.`);
            return;
        }

        const jobName = `event_${index}_${event.day}_${event.time}`;

        // Планируем задачу с указанием часового пояса (например, Киев)
        // Это важно, чтобы уведомления приходили по вашему местному времени
        schedule.scheduleJob(jobName, { hour: hour, minute: minute, dayOfWeek: dayOfWeek, tz: 'Europe/Kyiv' }, function(){
            console.log(`Отправляем уведомление: ${event.description}`);
            bot.sendMessage(adminChatId, `Hey buddy, it's time to: ${event.description}`);
        });
        console.log(`Запланировано: "${event.description}" на ${event.day} в ${event.time}`);
    });
    console.log('Все уведомления успешно запланированы.');
}


// --- Обработчики команд Telegram ---
bot.onText(/\/start/, (msg) => { /* ... код без изменений ... */
    const chatId = msg.chat.id;
    adminChatId = chatId;
    bot.sendMessage(chatId, 'Hi! What"s up? I"m Steph Curry, I"m here for you to be your assistant with the schedule!\n' +
        'Use:\n' +
        '* `/add ЧЧ.ММ week_day - description` (or without a dash)\n' +
        '  Ex: `/add 10.00 mon - work out`\n' +
        '  Or: `/add 14.00 вівторок зустріч`\n' +
        '* `/show_schedule` to see your schedule.\n' +
        '* `/clear_schedule` for clear the schedule up.\n\n' +
        'I will send notifications in the chat.');
    scheduleAllNotifications();
});

bot.onText(/\/add (.+)/, (msg, match) => { /* ... код без изменений ... */
    const chatId = msg.chat.id;
    const input = match[1].trim();

    const regex = /(\d{1,2}\.\d{2})\s*([а-яА-ЯёЁa-zA-Z]+)\s*(?:-?\s*)?(.+)/; // Добавил a-zA-Z для латинских дней
    const matchData = input.match(regex);

    if (matchData) {
        const time = matchData[1];
        let day = matchData[2].toLowerCase();
        const description = matchData[3].trim();

        const dayMap = {
            'понедельник': 'понедельник', 'пн': 'понедельник', 'mon': 'понедельник', 'monday': 'понедельник',
            'вторник': 'вторник', 'вт': 'вторник', 'вівторок': 'вторник', 'втр': 'вторник', 'tue': 'вторник', 'tuesday': 'вторник',
            'среда': 'среда', 'ср': 'среда', 'середа': 'среда', 'wed': 'среда', 'wednesday': 'среда',
            'четверг': 'четверг', 'чт': 'четверг', 'четвер': 'четверг', 'thu': 'четверг', 'thursday': 'четверг',
            'пятница': 'пятница', 'пт': 'пятница', 'п\'ятниця': 'пятница', 'fri':'пятница', 'friday': 'пятница',
            'суббота': 'суббота', 'сб': 'суббота', 'субота': 'суббота', 'sat': 'суббота' ,'saturday': 'суббота',
            'воскресенье': 'воскресенье', 'вс': 'воскресенье', 'неділя': 'воскресенье', 'sun': 'воскресенье', 'sunday': 'воскресенье',
        };

        const normalizedDay = dayMap[day];

        if (!normalizedDay) {
            bot.sendMessage(chatId, 'Неверный или нераспознанный день недели. Используйте: понедельник, вторник (вівторок), среда, четверг, пятница, суббота, воскресенье, или их сокращения (пн, вт, mon, tue и т.д.).');
            return;
        }

        day = normalizedDay;

        const currentSchedule = readSchedule();
        currentSchedule.push({ time, day, description });
        writeSchedule(currentSchedule);

        scheduleAllNotifications();

        bot.sendMessage(chatId, `An event "${description}" for ${day} in ${time} added and planned!`);
    } else {
        bot.sendMessage(chatId, 'The format is incorrect. Use: /add "ЧЧ.ММ day_of_week - description" or "ЧЧ.ММ day_of_week description", example: /add "10.00 mon - work out"');
    }
});

bot.onText(/\/show_schedule/, (msg) => { /* ... код без изменений ... */
    const chatId = msg.chat.id;
    const currentSchedule = readSchedule();

    if (currentSchedule.length === 0) {
        bot.sendMessage(chatId, 'The schedule is empty.');
        return;
    }

    let response = 'Your current schedule:\n';
    currentSchedule.forEach((event, index) => {
        response += `${index + 1}. ${event.time} ${event.day}: ${event.description}\n`;
    });
    bot.sendMessage(chatId, response);
});

bot.onText(/\/clear_schedule/, (msg) => { /* ... код без изменений ... */
    const chatId = msg.chat.id;
    writeSchedule([]);
    clearAllScheduledJobs();
    bot.sendMessage(chatId, 'The schedule has been cleared.');
});

bot.on('message', (msg) => { /* ... код без изменений ... */
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text && text.startsWith('/')) {
        return;
    }

    bot.sendMessage(chatId, 'I understand only commands. Use /start, /add, /show_schedule, /clear_schedule.');
});

// --- Обработка ошибок ---
// При вебхуках эта ошибка должна возникать реже, так как нет конфликта поллинга.
bot.on('polling_error', (error) => {
    console.error('Error while polling:', error);
});

// --- Запуск бота ---
// *** ИЗМЕНЕНИЕ 3: Запускаем Express сервер и устанавливаем вебхук ***
app.listen(PORT, async () => {
    console.log(`Webhook server listening on port ${PORT}`);
    // Устанавливаем вебхук в Telegram при успешном запуске сервера
    try {
        const setWebhookResult = await bot.setWebHook(`${WEBHOOK_URL}/bot${token}`);
        console.log('WebHook set:', setWebhookResult ? 'Success' : 'Failed');
    } catch (err) {
        console.error('Failed to set webhook:', err.message);
    }
    console.log('Bot is running...');
    scheduleAllNotifications(); // Планируем уведомления при старте бота
});