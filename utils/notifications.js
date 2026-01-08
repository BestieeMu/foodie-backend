const { Expo } = require('expo-server-sdk');
const supabase = require('./supabase');

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notifications to users
 * @param {string[]} userIds - Array of user IDs to send to
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Extra data payload
 */
async function sendPushNotifications(userIds, title, body, data = {}) {
  // 1. Fetch push tokens for users
  const { data: users, error } = await supabase
    .from('users')
    .select('push_token')
    .in('id', userIds)
    .not('push_token', 'is', null);

  if (error || !users || users.length === 0) {
    console.log('No push tokens found for users:', userIds);
    return;
  }

  const messages = [];
  for (const user of users) {
    if (!Expo.isExpoPushToken(user.push_token)) {
      console.error(`Push token ${user.push_token} is not a valid Expo push token`);
      continue;
    }

    messages.push({
      to: user.push_token,
      sound: 'default',
      title,
      body,
      data,
    });
  }

  // 2. Send the chunks
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending push notifications:', error);
    }
  }

  return tickets;
}

module.exports = { sendPushNotifications };
