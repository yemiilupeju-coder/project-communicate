/**
 * 200 test items for the voice spike: 100 single core words and 100 short
 * phrases of the kind found on school AAC boards. Written for this project;
 * not taken from any commercial AAC vocabulary.
 */

// prettier-ignore
export const CORE_WORDS: readonly string[] = [
  "I", "you", "it", "me", "my", "we", "he", "she", "they", "that",
  "this", "here", "there", "what", "where", "who", "when", "why", "how", "yes",
  "no", "not", "more", "all done", "stop", "go", "come", "look", "want", "like",
  "need", "help", "play", "eat", "drink", "open", "close", "turn", "put", "get",
  "give", "make", "do", "feel", "see", "hear", "say", "read", "write", "wait",
  "finished", "again", "different", "same", "big", "little", "good", "bad", "happy", "sad",
  "mad", "scared", "tired", "sick", "hot", "cold", "hungry", "thirsty", "hurt", "okay",
  "fast", "slow", "up", "down", "in", "out", "on", "off", "now", "later",
  "today", "tomorrow", "mom", "dad", "teacher", "friend", "home", "school", "bathroom", "water",
  "snack", "lunch", "music", "book", "ball", "outside", "please", "thank you", "sorry", "hello",
];

// prettier-ignore
export const PHRASES: readonly string[] = [
  "I need help.", "I want more.", "I'm finished.", "I need a break.", "I don't like that.",
  "I like this.", "Can you help me?", "I don't understand.", "Please stop.", "Wait for me.",
  "My turn.", "Your turn.", "I need the bathroom.", "I'm hungry.", "I'm thirsty.",
  "I'm tired.", "I feel sick.", "Something hurts.", "Leave me alone, please.", "Come here, please.",
  "Look at this.", "What's that?", "Where are we going?", "When is lunch?", "Can I go outside?",
  "I want to play.", "Let's go.", "Turn it up.", "Turn it down.", "It's too loud.",
  "It's too bright.", "I'm cold.", "I'm hot.", "I want to go home.", "I want to sit here.",
  "Can I have a snack?", "Can I have some water?", "I want something different.", "Do it again.", "That's funny.",
  "That's not fair.", "I'm happy.", "I'm sad.", "I'm angry.", "I'm scared.",
  "I'm excited.", "I'm bored.", "I'm okay.", "Good morning.", "Good night.",
  "See you later.", "How are you?", "I'm fine, thank you.", "What's your name?", "My name is on my card.",
  "Do you want to play with me?", "Can I play too?", "Let's take turns.", "Share with me, please.", "That's mine.",
  "That's yours.", "I need my headphones.", "I need my chair.", "I dropped it.", "It's broken.",
  "I can do it.", "I need more time.", "Show me how.", "Say it again, please.", "Read it to me.",
  "I want to read.", "I want to draw.", "I want to listen to music.", "I want to watch a video.", "Can we go to the library?",
  "Is it recess?", "Is it time to go?", "Where is my bag?", "Where is my teacher?", "Who is that?",
  "I know the answer.", "I have a question.", "I don't know.", "Maybe.", "I'm not sure.",
  "Yes, please.", "No, thank you.", "I changed my mind.", "Not now.", "Later, please.",
  "I want to be alone.", "Please sit with me.", "Hug, please.", "High five!", "Great job!",
  "I love you.", "I miss you.", "Thank you for helping me.", "I'm sorry.", "It's okay.",
];

/** All 200 items, words first. Index is stable and used as the clip key. */
export const SPIKE_VOCABULARY: readonly string[] = [...CORE_WORDS, ...PHRASES];

/** A four-clip sentence used to test back-to-back playback. */
export const TEST_SENTENCE: readonly string[] = ["I", "want", "more", "please"];
