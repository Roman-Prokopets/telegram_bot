// Ваш токен бота
// bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
// ...
const token = process.env.TELEGRAM_BOT_TOKEN;
// Импортируем необходимые библиотеки
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule'); // Библиотека для планирования задач

// Ваш токен бота. Замените его на свой реальный токен из BotFather.
// Создаем новый экземпляр бота с режимом поллинга
const bot = new TelegramBot(token, { polling: true });

// Определяем путь к файлу, где будем хранить расписание
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');

// Переменная для хранения ID чата пользователя, которому нужно отправлять уведомления.
// Для простоты, здесь хранится ID последнего пользователя, отправившего /start.
// В более сложных случаях, можно сохранять массив ID или использовать базу данных.
let adminChatId = null;

// --- Вспомогательные функции для работы с файлом расписания ---

/**
 * Читает расписание из файла SCHEDULE_FILE.
 * @returns {Array} Массив объектов расписания или пустой массив, если файл не найден/пуст.
 */
function readSchedule() {
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

/**
 * Записывает массив объектов расписания в файл SCHEDULE_FILE.
 * @param {Array} scheduleData - Массив объектов расписания для записи.
 */
function writeSchedule(scheduleData) {
    try {
        // Преобразуем массив в JSON-строку с красивым форматированием (2 пробела)
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduleData, null, 2), 'utf8');
    } catch (error) {
        console.error('Ошибка при записи файла расписания:', error);
    }
}

// --- Функции для планирования уведомлений ---

/**
 * Отменяет все текущие запланированные задачи (уведомления).
 */
function clearAllScheduledJobs() {
    for (const jobName in schedule.scheduledJobs) {
        schedule.scheduledJobs[jobName].cancel();
    }
    console.log('Все запланированные задачи очищены.');
}

/**
 * Перепланирует все уведомления на основе текущего расписания из файла.
 * Вызывается при запуске бота и после каждого добавления/удаления события.
 */
function scheduleAllNotifications() {
    clearAllScheduledJobs(); // Отменяем все старые задачи, чтобы избежать дублирования

    const currentSchedule = readSchedule();
    if (currentSchedule.length === 0) {
        console.log('Расписание пусто. Нет задач для планирования.');
        return;
    }

    // Карта для преобразования нормализованного дня недели в числовой формат node-schedule
    // (0 = воскресенье, 1 = понедельник, ..., 6 = суббота)
    const dayToNumberMap = {
        'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4,
        'пятница': 5, 'суббота': 6, 'воскресенье': 0
    };

    currentSchedule.forEach((event, index) => {
        // Проверяем, что у нас есть ID чата для отправки уведомлений
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

        // Создаем уникальное имя для каждой задачи
        const jobName = `event_${index}_${event.day}_${event.time}`;

        // Планируем задачу
        schedule.scheduleJob(jobName, { hour: hour, minute: minute, dayOfWeek: dayOfWeek }, function(){
            console.log(`Отправляем уведомление: ${event.description}`);
            bot.sendMessage(adminChatId, `Hey buddy, it's time to: ${event.description}`);
        });
        console.log(`Запланировано: "${event.description}" на ${event.day} в ${event.time}`);
    });
    console.log('Все уведомления успешно запланированы.');
}

// --- Обработчики команд Telegram ---

// Обработчик команды /start
// Приветствует пользователя и сохраняет его chat.id для отправки уведомлений.
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    adminChatId = chatId; // Сохраняем ID чата для будущих уведомлений
    bot.sendMessage(chatId, 'Hi! What"s up? I"m Steph Curry, I"m here for you to be your assistant with the schedule!\n' +
        'Use:\n' +
        '* `/add ЧЧ.ММ week_day - description` (or without a dash)\n' +
        '  Ex: `/add 10.00 mon - work out`\n' +
        '  Or: `/add 14.00 вівторок зустріч`\n' +
        '* `/show_schedule` to see your schedule.\n' +
        '* `/clear_schedule` for clear the schedule up.\n\n' +
        'I will send notifications in the chat.');
    scheduleAllNotifications(); // Планируем уведомления сразу после старта, если есть сохраненные
});

// Обработчик команды /add
// Добавляет новое событие в расписание.
bot.onText(/\/add (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const input = match[1].trim(); // Получаем часть сообщения после /add

    // Регулярное выражение для парсинга: "ЧЧ.ММ день_недели [необязательный дефис/пробелы] описание"
    const regex = /(\d{1,2}\.\d{2})\s*([а-яА-ЯёЁ]+)\s*(?:-?\s*)?(.+)/;
    const matchData = input.match(regex);

    if (matchData) {
        const time = matchData[1];
        let day = matchData[2].toLowerCase(); // День недели, приводим к нижнему регистру
        const description = matchData[3].trim(); // Описание события

        // Карта для нормализации введенных дней недели (русский/украинский/сокращения)
        const dayMap = {
            'понедельник': 'понедельник', 'пн': 'понедельник', 'mon': 'mon', 'monday': 'monday',
            'вторник': 'вторник', 'вт': 'вторник', 'вівторок': 'вторник', 'втр': 'вторник', 'tue': 'tue', 'tuesday': 'tuesday',
            'среда': 'среда', 'ср': 'среда', 'середа': 'среда', 'wed': 'wed', 'wednesday': 'wednesday',
            'четверг': 'четверг', 'чт': 'четверг', 'четвер': 'четверг', 'thu': 'thu', 'thusday': 'thusday',
            'пятница': 'пятница', 'пт': 'пятница', 'п\'ятниця': 'пятница', 'fri':'fri', 'friday': 'friday',
            'суббота': 'суббота', 'сб': 'суббота', 'субота': 'суббота', 'sat': 'sat' ,'saturday': 'saturday',
            'воскресенье': 'воскресенье', 'вс': 'воскресенье', 'неділя': 'воскресенье', 'sun': 'sun', 'sunday': 'sunday',
        };

        const normalizedDay = dayMap[day];

        if (!normalizedDay) {
            bot.sendMessage(chatId, 'Неверный или нераспознанный день недели. Используйте: понедельник, вторник (вівторок), среда, четверг, пятница, суббота, воскресенье, или их сокращения (пн, вт и т.д.).');
            return;
        }

        // Используем нормализованное название дня недели для сохранения
        day = normalizedDay;

        const currentSchedule = readSchedule();
        currentSchedule.push({ time, day, description });
        writeSchedule(currentSchedule);

        scheduleAllNotifications(); // Перепланируем все задачи, чтобы включить новую

        bot.sendMessage(chatId, `An event "${description}" for ${day} in ${time} added and planned!`);
    } else {
        bot.sendMessage(chatId, 'The format is incorrect. Use: /add "ЧЧ.ММ день_недели - description" or "ЧЧ.ММ week_day description", example: /add "10.00 понедельник - work out"');
    }
});

// Обработчик команды /show_schedule
// Отображает текущее расписание.
bot.onText(/\/show_schedule/, (msg) => {
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

// Обработчик команды /clear_schedule
// Очищает все события в расписании и отменяет все запланированные уведомления.
bot.onText(/\/clear_schedule/, (msg) => {
    const chatId = msg.chat.id;
    writeSchedule([]); // Записываем пустой массив в файл
    clearAllScheduledJobs(); // Отменяем все активные задачи
    bot.sendMessage(chatId, 'The schedule has been cleared.');
});


// Обработчик любых других текстовых сообщений, не являющихся командами.
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Игнорируем команды, чтобы избежать повторной обработки
    if (text && text.startsWith('/')) {
        return;
    }

    bot.sendMessage(chatId, 'Я понимаю только команды. Используйте /start, /add, /show_schedule, /clear_schedule.');
});

// --- Обработка ошибок ---

// Дополнительный обработчик для ошибок поллинга.
// Помогает диагностировать проблемы с подключением к Telegram API.
bot.on('polling_error', (error) => {
    console.error('Error while polling:', error);
    // Вы можете добавить сюда логику для уведомления администратора,
    // например, отправить сообщение в определенный чат, если ошибка критична.
});

// --- Запуск бота ---

console.log('Bot is running...');
scheduleAllNotifications(); // Планируем уведомления при старте бота, если есть сохраненные события.