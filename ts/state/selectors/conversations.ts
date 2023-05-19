import { createSelector } from '@reduxjs/toolkit';

import {
  ConversationLookupType,
  ConversationsStateType,
  MentionsMembersType,
  MessageModelPropsWithConvoProps,
  MessageModelPropsWithoutConvoProps,
  MessagePropsDetails,
  ReduxConversationType,
  SortedMessageModelProps,
} from '../ducks/conversations';
import { StateType } from '../reducer';

import { ReplyingToMessageProps } from '../../components/conversation/composition/CompositionBox';
import { MessageAttachmentSelectorProps } from '../../components/conversation/message/message-content/MessageAttachment';
import { MessageAuthorSelectorProps } from '../../components/conversation/message/message-content/MessageAuthorText';
import { MessageAvatarSelectorProps } from '../../components/conversation/message/message-content/MessageAvatar';
import { MessageContentSelectorProps } from '../../components/conversation/message/message-content/MessageContent';
import { MessageContentWithStatusSelectorProps } from '../../components/conversation/message/message-content/MessageContentWithStatus';
import { MessageContextMenuSelectorProps } from '../../components/conversation/message/message-content/MessageContextMenu';
import { MessageLinkPreviewSelectorProps } from '../../components/conversation/message/message-content/MessageLinkPreview';
import { MessageQuoteSelectorProps } from '../../components/conversation/message/message-content/MessageQuote';
import { MessageStatusSelectorProps } from '../../components/conversation/message/message-content/MessageStatus';
import { MessageTextSelectorProps } from '../../components/conversation/message/message-content/MessageText';
import { GenericReadableMessageSelectorProps } from '../../components/conversation/message/message-item/GenericReadableMessage';
import { LightBoxOptions } from '../../components/conversation/SessionConversation';
import { hasValidIncomingRequestValues } from '../../models/conversation';
import {
  CONVERSATION_PRIORITIES,
  ConversationTypeEnum,
  isOpenOrClosedGroup,
} from '../../models/conversationAttributes';
import { getConversationController } from '../../session/conversations';
import { UserUtils } from '../../session/utils';
import { LocalizerType } from '../../types/Util';
import { BlockedNumberController } from '../../util';
import { Storage } from '../../util/storage';
import { getIntl } from './user';

import { filter, isEmpty, isNumber, pick, sortBy } from 'lodash';
import { MessageReactsSelectorProps } from '../../components/conversation/message/message-content/MessageReactions';
import { getModeratorsOutsideRedux } from './sogsRoomInfo';
import { getSelectedConversation, getSelectedConversationKey } from './selectedConversation';
import { useSelector } from 'react-redux';

export const getConversations = (state: StateType): ConversationsStateType => state.conversations;

export const getConversationLookup = createSelector(
  getConversations,
  (state: ConversationsStateType): ConversationLookupType => {
    return state.conversationLookup;
  }
);

export const getConversationsCount = createSelector(getConversationLookup, (state): number => {
  return Object.values(state).length;
});

export const getOurPrimaryConversation = createSelector(
  getConversations,
  (state: ConversationsStateType): ReduxConversationType =>
    state.conversationLookup[Storage.get('primaryDevicePubKey') as string]
);

const getMessagesOfSelectedConversation = createSelector(
  getConversations,
  (state: ConversationsStateType): Array<MessageModelPropsWithoutConvoProps> => state.messages
);

// Redux recommends to do filtered and deriving state in a selector rather than ourself
export const getSortedMessagesOfSelectedConversation = createSelector(
  getMessagesOfSelectedConversation,
  (messages: Array<MessageModelPropsWithoutConvoProps>): Array<SortedMessageModelProps> => {
    if (messages.length === 0) {
      return [];
    }

    const convoId = messages[0].propsForMessage.convoId;
    const convo = getConversationController().get(convoId);

    if (!convo) {
      return [];
    }

    const isPublic = convo.isPublic() || false;
    const sortedMessage = sortMessages(messages, isPublic);

    return updateFirstMessageOfSeries(sortedMessage);
  }
);

export const hasSelectedConversationIncomingMessages = createSelector(
  getSortedMessagesOfSelectedConversation,
  (messages: Array<MessageModelPropsWithoutConvoProps>): boolean => {
    return messages.some(m => m.propsForMessage.direction === 'incoming');
  }
);

export const getFirstUnreadMessageId = createSelector(
  getConversations,
  (state: ConversationsStateType): string | undefined => {
    return state.firstUnreadMessageId;
  }
);

export type MessagePropsType =
  | 'group-notification'
  | 'group-invitation'
  | 'data-extraction'
  | 'message-request-response'
  | 'timer-notification'
  | 'regular-message'
  | 'unread-indicator'
  | 'call-notification';

export const getSortedMessagesTypesOfSelectedConversation = createSelector(
  getSortedMessagesOfSelectedConversation,
  getFirstUnreadMessageId,
  (sortedMessages, firstUnreadId) => {
    const maxMessagesBetweenTwoDateBreaks = 5;
    // we want to show the date break if there is a large jump in time
    // remember that messages are sorted from the most recent to the oldest
    return sortedMessages.map((msg, index) => {
      const isFirstUnread = Boolean(firstUnreadId === msg.propsForMessage.id);
      const messageTimestamp = msg.propsForMessage.serverTimestamp || msg.propsForMessage.timestamp;
      // do not show the date break if we are the oldest message (no previous)
      // this is to smooth a bit the loading of older message (to avoid a jump once new messages are rendered)
      const previousMessageTimestamp =
        index + 1 >= sortedMessages.length
          ? Number.MAX_SAFE_INTEGER
          : sortedMessages[index + 1].propsForMessage.serverTimestamp ||
            sortedMessages[index + 1].propsForMessage.timestamp;

      const showDateBreak =
        messageTimestamp - previousMessageTimestamp > maxMessagesBetweenTwoDateBreaks * 60 * 1000
          ? messageTimestamp
          : undefined;

      const common = { showUnreadIndicator: isFirstUnread, showDateBreak };

      if (msg.propsForDataExtractionNotification) {
        return {
          ...common,
          message: {
            messageType: 'data-extraction',
            props: { ...msg.propsForDataExtractionNotification, messageId: msg.propsForMessage.id },
          },
        };
      }

      if (msg.propsForMessageRequestResponse) {
        return {
          ...common,
          message: {
            messageType: 'message-request-response',
            props: { ...msg.propsForMessageRequestResponse, messageId: msg.propsForMessage.id },
          },
        };
      }

      if (msg.propsForGroupInvitation) {
        return {
          ...common,
          message: {
            messageType: 'group-invitation',
            props: { ...msg.propsForGroupInvitation, messageId: msg.propsForMessage.id },
          },
        };
      }

      if (msg.propsForGroupUpdateMessage) {
        return {
          ...common,
          message: {
            messageType: 'group-notification',
            props: { ...msg.propsForGroupUpdateMessage, messageId: msg.propsForMessage.id },
          },
        };
      }

      if (msg.propsForTimerNotification) {
        return {
          ...common,
          message: {
            messageType: 'timer-notification',
            props: { ...msg.propsForTimerNotification, messageId: msg.propsForMessage.id },
          },
        };
      }

      if (msg.propsForCallNotification) {
        return {
          ...common,
          message: {
            messageType: 'call-notification',
            props: {
              ...msg.propsForCallNotification,
              messageId: msg.propsForMessage.id,
            },
          },
        };
      }

      return {
        showUnreadIndicator: isFirstUnread,
        showDateBreak,
        message: {
          messageType: 'regular-message',
          props: { messageId: msg.propsForMessage.id },
        },
      };
    });
  }
);

function getConversationTitle(
  conversation: ReduxConversationType,
  testingi18n?: LocalizerType
): string {
  if (conversation.displayNameInProfile) {
    return conversation.displayNameInProfile;
  }

  if (isOpenOrClosedGroup(conversation.type)) {
    return (testingi18n || window.i18n)('unknown');
  }
  return conversation.id;
}

const collator = new Intl.Collator();

export const _getConversationComparator = (testingi18n?: LocalizerType) => {
  return (left: ReduxConversationType, right: ReduxConversationType): number => {
    // Pin is the first criteria to check
    const leftPriority = left.priority || 0;
    const rightPriority = right.priority || 0;
    if (leftPriority > rightPriority) {
      return -1;
    }
    if (rightPriority > leftPriority) {
      return 1;
    }
    // Then if none are pinned, check other criteria
    const leftActiveAt = left.activeAt;
    const rightActiveAt = right.activeAt;
    if (leftActiveAt && !rightActiveAt) {
      return -1;
    }
    if (rightActiveAt && !leftActiveAt) {
      return 1;
    }
    if (leftActiveAt && rightActiveAt && leftActiveAt !== rightActiveAt) {
      return rightActiveAt - leftActiveAt;
    }
    const leftTitle = getConversationTitle(left, testingi18n).toLowerCase();
    const rightTitle = getConversationTitle(right, testingi18n).toLowerCase();

    return collator.compare(leftTitle, rightTitle);
  };
};

export const getConversationComparator = createSelector(getIntl, _getConversationComparator);

// tslint:disable-next-line: cyclomatic-complexity
const _getLeftPaneLists = (
  sortedConversations: Array<ReduxConversationType>
): {
  conversations: Array<ReduxConversationType>;
  contacts: Array<ReduxConversationType>;
  globalUnreadCount: number;
} => {
  const conversations: Array<ReduxConversationType> = [];
  const directConversations: Array<ReduxConversationType> = [];

  let globalUnreadCount = 0;
  for (const conversation of sortedConversations) {
    // Blocked conversation are now only visible from the settings, not in the conversation list, so don't add it neither to the contacts list nor the conversation list
    if (conversation.isBlocked) {
      continue;
    }
    // a contact is a private conversation that is approved by us and active
    if (
      conversation.activeAt !== undefined &&
      conversation.type === ConversationTypeEnum.PRIVATE &&
      conversation.isApproved
      // we want to keep the hidden conversation in the direct contact list, so we don't filter based on priority
    ) {
      directConversations.push(conversation);
    }

    // a private conversation not approved is a message request. Exclude them from the left pane lists
    if (conversation.isPrivate && !conversation.isApproved) {
      continue;
    }

    const isPrivateButHidden =
      conversation.isPrivate &&
      conversation.priority &&
      conversation.priority <= CONVERSATION_PRIORITIES.default;

    /**
     * When getting a contact from a linked device, before he sent a message, the approved field is false, but a createdAt is used as activeAt
     */
    const isPrivateUnapprovedButActive =
      conversation.isPrivate && !conversation.isApproved && !conversation.activeAt;

    if (
      isPrivateUnapprovedButActive ||
      isPrivateButHidden // a hidden contact conversation is only visible from the contact list, not from the global conversation list
    ) {
      // dont increase unread counter, don't push to convo list.
      continue;
    }

    if (
      globalUnreadCount < 100 &&
      isNumber(conversation.unreadCount) &&
      isFinite(conversation.unreadCount) &&
      conversation.unreadCount > 0 &&
      conversation.currentNotificationSetting !== 'disabled'
    ) {
      globalUnreadCount += conversation.unreadCount;
    }

    conversations.push(conversation);
  }

  return {
    conversations,
    contacts: directConversations,
    globalUnreadCount,
  };
};

export const _getSortedConversations = (
  lookup: ConversationLookupType,
  comparator: (left: ReduxConversationType, right: ReduxConversationType) => number,
  selectedConversation?: string
): Array<ReduxConversationType> => {
  const values = Object.values(lookup);
  const sorted = values.sort(comparator);

  const sortedConversations: Array<ReduxConversationType> = [];

  for (const conversation of sorted) {
    // Remove all invalid conversations and conversatons of devices associated
    //  with cancelled attempted links
    if (!conversation.isPublic && !conversation.activeAt) {
      continue;
    }

    const isBlocked = BlockedNumberController.isBlocked(conversation.id);
    const isSelected = selectedConversation === conversation.id;

    sortedConversations.push({
      ...conversation,
      isSelected: isSelected || undefined,
      isBlocked: isBlocked || undefined,
    });
  }

  return sortedConversations;
};

export const getSortedConversations = createSelector(
  getConversationLookup,
  getConversationComparator,
  getSelectedConversationKey,
  _getSortedConversations
);

/**
 *
 * @param sortedConversations List of conversations that are valid for both requests and regular conversation inbox
 * @returns A list of message request conversations.
 */
const _getConversationRequests = (
  sortedConversations: Array<ReduxConversationType>
): Array<ReduxConversationType> => {
  return filter(sortedConversations, conversation => {
    const { isApproved, isBlocked, isPrivate, isMe, activeAt, didApproveMe } = conversation;
    const isIncomingRequest = hasValidIncomingRequestValues({
      isApproved: isApproved || false,
      isBlocked: isBlocked || false,
      isPrivate: isPrivate || false,
      isMe: isMe || false,
      activeAt: activeAt || 0,
      didApproveMe: didApproveMe || false,
    });
    return isIncomingRequest;
  });
};

export const getConversationRequests = createSelector(
  getSortedConversations,
  _getConversationRequests
);

const _getUnreadConversationRequests = (
  sortedConversationRequests: Array<ReduxConversationType>
): Array<ReduxConversationType> => {
  return filter(sortedConversationRequests, conversation => {
    return Boolean(conversation && conversation.unreadCount && conversation.unreadCount > 0);
  });
};

export const getUnreadConversationRequests = createSelector(
  getConversationRequests,
  _getUnreadConversationRequests
);

const _getPrivateContactsPubkeys = (
  sortedConversations: Array<ReduxConversationType>
): Array<string> => {
  return filter(sortedConversations, conversation => {
    return !!(
      conversation.isPrivate &&
      !conversation.isBlocked &&
      !conversation.isMe &&
      conversation.didApproveMe &&
      conversation.isApproved &&
      conversation.activeAt
    );
  }).map(convo => convo.id);
};

/**
 * Returns all the conversation ids of private conversations which are
 * - private
 * - not me
 * - not blocked
 * - approved (or message requests are disabled)
 * - active_at is set to something truthy
 */
export const getPrivateContactsPubkeys = createSelector(
  getSortedConversations,
  _getPrivateContactsPubkeys
);

export const getLeftPaneLists = createSelector(getSortedConversations, _getLeftPaneLists);

export const getDirectContacts = createSelector(
  getLeftPaneLists,
  (state: {
    conversations: Array<ReduxConversationType>;
    contacts: Array<ReduxConversationType>;
    globalUnreadCount: number;
  }) => state.contacts
);

export const getDirectContactsCount = createSelector(
  getDirectContacts,
  (contacts: Array<ReduxConversationType>) => contacts.length
);

export type DirectContactsByNameType = {
  displayName?: string;
  id: string;
};

// make sure that createSelector is called here so this function is memoized
export const getDirectContactsByName = createSelector(
  getDirectContacts,
  (contacts: Array<ReduxConversationType>): Array<DirectContactsByNameType> => {
    const us = UserUtils.getOurPubKeyStrFromCache();
    const extractedContacts = contacts
      .filter(m => m.id !== us)
      .map(m => {
        return {
          id: m.id,
          displayName: m.nickname || m.displayNameInProfile,
        };
      });
    const extractedContactsNoDisplayName = sortBy(
      extractedContacts.filter(m => !m.displayName),
      'id'
    );
    const extractedContactsWithDisplayName = sortBy(
      extractedContacts.filter(m => Boolean(m.displayName)),
      'displayName'
    );

    return [...extractedContactsWithDisplayName, ...extractedContactsNoDisplayName];
  }
);

export const getGlobalUnreadMessageCount = createSelector(getLeftPaneLists, (state): number => {
  return state.globalUnreadCount;
});

export const isMessageDetailView = createSelector(
  getConversations,
  (state: ConversationsStateType): boolean => state.messageDetailProps !== undefined
);

export const getMessageDetailsViewProps = createSelector(
  getConversations,
  (state: ConversationsStateType): MessagePropsDetails | undefined => state.messageDetailProps
);

export const isRightPanelShowing = createSelector(
  getConversations,
  (state: ConversationsStateType): boolean => state.showRightPanel
);

export const isMessageSelectionMode = createSelector(
  getConversations,
  (state: ConversationsStateType): boolean => Boolean(state.selectedMessageIds.length > 0)
);

export const getSelectedMessageIds = createSelector(
  getConversations,
  (state: ConversationsStateType): Array<string> => state.selectedMessageIds
);

export const getIsMessageSelectionMode = createSelector(
  getSelectedMessageIds,
  (state: Array<string>): boolean => Boolean(state.length)
);

export const getLightBoxOptions = createSelector(
  getConversations,
  (state: ConversationsStateType): LightBoxOptions | undefined => state.lightBox
);

export const getQuotedMessage = createSelector(
  getConversations,
  (state: ConversationsStateType): ReplyingToMessageProps | undefined => state.quotedMessage
);

export const areMoreMessagesBeingFetched = createSelector(
  getConversations,
  (state: ConversationsStateType): boolean => state.areMoreMessagesBeingFetched || false
);

export const getShowScrollButton = createSelector(
  getConversations,
  (state: ConversationsStateType): boolean => state.showScrollButton || false
);

export const getQuotedMessageToAnimate = createSelector(
  getConversations,
  (state: ConversationsStateType): string | undefined => state.animateQuotedMessageId || undefined
);

export const getShouldHighlightMessage = createSelector(
  getConversations,
  (state: ConversationsStateType): boolean =>
    Boolean(state.animateQuotedMessageId && state.shouldHighlightMessage)
);

export const getNextMessageToPlayId = createSelector(
  getConversations,
  (state: ConversationsStateType): string | undefined => state.nextMessageToPlayId || undefined
);

export const getMentionsInput = createSelector(
  getConversations,
  (state: ConversationsStateType): MentionsMembersType => state.mentionMembers
);

/// Those calls are just related to ordering messages in the redux store.

function updateFirstMessageOfSeries(
  messageModelsProps: Array<MessageModelPropsWithoutConvoProps>
): Array<SortedMessageModelProps> {
  // messages are got from the more recent to the oldest, so we need to check if
  // the next messages in the list is still the same author.
  // The message is the first of the series if the next message is not from the same author
  const sortedMessageProps: Array<SortedMessageModelProps> = [];

  for (let i = 0; i < messageModelsProps.length; i++) {
    const currentSender = messageModelsProps[i].propsForMessage?.sender;
    // most recent message is at index 0, so the previous message sender is 1+index
    const previousSender =
      i < messageModelsProps.length - 1
        ? messageModelsProps[i + 1].propsForMessage?.sender
        : undefined;
    const nextSender = i > 0 ? messageModelsProps[i - 1].propsForMessage?.sender : undefined;
    // Handle firstMessageOfSeries for conditional avatar rendering

    sortedMessageProps.push({
      ...messageModelsProps[i],
      firstMessageOfSeries: !(i >= 0 && currentSender === previousSender),
      lastMessageOfSeries: currentSender !== nextSender,
    });
  }
  return sortedMessageProps;
}

function sortMessages(
  messages: Array<MessageModelPropsWithoutConvoProps>,
  isPublic: boolean
): Array<MessageModelPropsWithoutConvoProps> {
  // we order by serverTimestamp for public convos
  // be sure to update the sorting order to fetch messages from the DB too at getMessagesByConversation
  if (isPublic) {
    return messages.slice().sort((a, b) => {
      return (b.propsForMessage.serverTimestamp || 0) - (a.propsForMessage.serverTimestamp || 0);
    });
  }
  if (messages.some(n => !n.propsForMessage.timestamp && !n.propsForMessage.receivedAt)) {
    throw new Error('Found some messages without any timestamp set');
  }

  // for non public convos, we order by sent_at or received_at timestamp.
  // we assume that a message has either a sent_at or a received_at field set.
  const messagesSorted = messages
    .slice()
    .sort(
      (a, b) =>
        (b.propsForMessage.timestamp || b.propsForMessage.receivedAt || 0) -
        (a.propsForMessage.timestamp || a.propsForMessage.receivedAt || 0)
    );

  return messagesSorted;
}

/**
 * This returns the most recent message id in the database. This is not the most recent message shown,
 * but the most recent one, which could still not be loaded.
 */
export const getMostRecentMessageId = createSelector(
  getConversations,
  (state: ConversationsStateType): string | null => {
    return state.mostRecentMessageId;
  }
);

export const getOldestMessageId = createSelector(
  getSortedMessagesOfSelectedConversation,
  (messages: Array<MessageModelPropsWithoutConvoProps>): string | undefined => {
    const oldest =
      messages.length > 0 ? messages[messages.length - 1].propsForMessage.id : undefined;

    return oldest;
  }
);

export const getYoungestMessageId = createSelector(
  getSortedMessagesOfSelectedConversation,
  (messages: Array<MessageModelPropsWithoutConvoProps>): string | undefined => {
    const youngest = messages.length > 0 ? messages[0].propsForMessage.id : undefined;

    return youngest;
  }
);

function getMessagesFromState(state: StateType) {
  return state.conversations.messages;
}

export function getLoadedMessagesLength(state: StateType) {
  return getMessagesFromState(state).length;
}

export function getSelectedHasMessages(state: StateType): boolean {
  return !isEmpty(getMessagesFromState(state));
}

export const isFirstUnreadMessageIdAbove = createSelector(
  getConversations,
  (state: ConversationsStateType): boolean => {
    if (!state.firstUnreadMessageId) {
      return false;
    }

    const isNotPresent = !state.messages.some(
      m => m.propsForMessage.id === state.firstUnreadMessageId
    );

    return isNotPresent;
  }
);

const getMessageId = (_whatever: any, id: string) => id;

// tslint:disable: cyclomatic-complexity

export const getMessagePropsByMessageId = createSelector(
  getSortedMessagesOfSelectedConversation,
  getConversationLookup,
  getMessageId,

  (
    messages: Array<SortedMessageModelProps>,
    conversations,
    id
  ): MessageModelPropsWithConvoProps | undefined => {
    const foundMessageProps: SortedMessageModelProps | undefined = messages?.find(
      m => m?.propsForMessage?.id === id
    );

    if (!foundMessageProps || !foundMessageProps.propsForMessage.convoId) {
      return undefined;
    }
    const sender = foundMessageProps?.propsForMessage?.sender;

    // foundMessageConversation is the conversation this message is
    const foundMessageConversation = conversations[foundMessageProps.propsForMessage.convoId];
    if (!foundMessageConversation || !sender) {
      return undefined;
    }

    const foundSenderConversation = conversations[sender];
    if (!foundSenderConversation) {
      return undefined;
    }

    const ourPubkey = UserUtils.getOurPubKeyStrFromCache();
    const isGroup = !foundMessageConversation.isPrivate;
    const isPublic = foundMessageConversation.isPublic;

    const groupAdmins = (isGroup && foundMessageConversation.groupAdmins) || [];
    const weAreAdmin = groupAdmins.includes(ourPubkey) || false;

    const weAreModerator =
      (isPublic && getModeratorsOutsideRedux(foundMessageConversation.id).includes(ourPubkey)) ||
      false;
    // A message is deletable if
    // either we sent it,
    // or the convo is not a public one (in this case, we will only be able to delete for us)
    // or the convo is public and we are an admin or moderator
    const isDeletable =
      sender === ourPubkey || !isPublic || (isPublic && (weAreAdmin || weAreModerator));

    // A message is deletable for everyone if
    // either we sent it no matter what the conversation type,
    // or the convo is public and we are an admin or moderator
    const isDeletableForEveryone =
      sender === ourPubkey || (isPublic && (weAreAdmin || weAreModerator)) || false;

    const isSenderAdmin = groupAdmins.includes(sender);
    const senderIsUs = sender === ourPubkey;

    const authorName =
      foundSenderConversation.nickname || foundSenderConversation.displayNameInProfile || null;
    const authorProfileName = senderIsUs
      ? window.i18n('you')
      : foundSenderConversation.nickname ||
        foundSenderConversation.displayNameInProfile ||
        window.i18n('anonymous');

    const messageProps: MessageModelPropsWithConvoProps = {
      ...foundMessageProps,
      propsForMessage: {
        ...foundMessageProps.propsForMessage,
        isBlocked: !!foundMessageConversation.isBlocked,
        isPublic: !!isPublic,
        isOpenGroupV2: !!isPublic,
        isSenderAdmin,
        isDeletable,
        isDeletableForEveryone,
        weAreAdmin,
        conversationType: foundMessageConversation.type,
        sender,
        authorAvatarPath: foundSenderConversation.avatarPath || null,
        isKickedFromGroup: foundMessageConversation.isKickedFromGroup || false,
        authorProfileName: authorProfileName || 'Unknown',
        authorName,
      },
    };

    return messageProps;
  }
);

export const getMessageAvatarProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageAvatarSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const messageAvatarProps: MessageAvatarSelectorProps = {
    lastMessageOfSeries: props.lastMessageOfSeries,
    ...pick(props.propsForMessage, [
      'authorAvatarPath',
      'authorName',
      'sender',
      'authorProfileName',
      'conversationType',
      'direction',
      'isPublic',
      'isSenderAdmin',
    ]),
  };

  return messageAvatarProps;
});

export const getMessageReactsProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageReactsSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageReactsSelectorProps = pick(props.propsForMessage, [
    'convoId',
    'conversationType',
    'isPublic',
    'reacts',
    'serverId',
  ]);

  if (msgProps.reacts) {
    // NOTE we don't want to render reactions that have 'senders' as an object this is a deprecated type used during development 25/08/2022
    const oldReactions = Object.values(msgProps.reacts).filter(
      reaction => !Array.isArray(reaction.senders)
    );

    if (oldReactions.length > 0) {
      msgProps.reacts = undefined;
      return msgProps;
    }

    const sortedReacts = Object.entries(msgProps.reacts).sort((a, b) => {
      return a[1].index < b[1].index ? -1 : a[1].index > b[1].index ? 1 : 0;
    });
    msgProps.sortedReacts = sortedReacts;
  }

  return msgProps;
});

export const getMessageLinkPreviewProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageLinkPreviewSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageLinkPreviewSelectorProps = pick(props.propsForMessage, [
    'direction',
    'attachments',
    'previews',
  ]);

  return msgProps;
});

export const getMessageQuoteProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageQuoteSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageQuoteSelectorProps = pick(props.propsForMessage, ['direction', 'quote']);

  return msgProps;
});

export const getMessageStatusProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageStatusSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageStatusSelectorProps = pick(props.propsForMessage, ['direction', 'status']);

  return msgProps;
});

export const getMessageTextProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageTextSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageTextSelectorProps = pick(props.propsForMessage, [
    'direction',
    'status',
    'text',
    'isDeleted',
    'conversationType',
  ]);

  return msgProps;
});

export const useMessageIsDeleted = (messageId: string): boolean => {
  const props = useSelector((state: StateType) => getMessagePropsByMessageId(state, messageId));
  return props?.propsForMessage.isDeleted || false;
};

export const getMessageContextMenuProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageContextMenuSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageContextMenuSelectorProps = pick(props.propsForMessage, [
    'attachments',
    'sender',
    'convoId',
    'direction',
    'status',
    'isDeletable',
    'isPublic',
    'isOpenGroupV2',
    'weAreAdmin',
    'isSenderAdmin',
    'text',
    'serverTimestamp',
    'timestamp',
    'isBlocked',
    'isDeletableForEveryone',
  ]);

  return msgProps;
});

export const getMessageAuthorProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageAuthorSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageAuthorSelectorProps = {
    firstMessageOfSeries: props.firstMessageOfSeries,
    ...pick(props.propsForMessage, ['authorName', 'sender', 'authorProfileName', 'direction']),
  };

  return msgProps;
});

export const getMessageIsDeletable = createSelector(
  getMessagePropsByMessageId,
  (props): boolean => {
    if (!props || isEmpty(props)) {
      return false;
    }

    return props.propsForMessage.isDeletable;
  }
);

export const getMessageAttachmentProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageAttachmentSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageAttachmentSelectorProps = {
    attachments: props.propsForMessage.attachments || [],
    ...pick(props.propsForMessage, [
      'direction',
      'isTrustedForAttachmentDownload',
      'timestamp',
      'serverTimestamp',
      'sender',
      'convoId',
    ]),
  };

  return msgProps;
});

export const getIsMessageSelected = createSelector(
  getMessagePropsByMessageId,
  getSelectedMessageIds,
  (props, selectedIds): boolean => {
    if (!props || isEmpty(props)) {
      return false;
    }

    const { id } = props.propsForMessage;

    return selectedIds.includes(id);
  }
);

export const getMessageContentSelectorProps = createSelector(getMessagePropsByMessageId, (props):
  | MessageContentSelectorProps
  | undefined => {
  if (!props || isEmpty(props)) {
    return undefined;
  }

  const msgProps: MessageContentSelectorProps = {
    ...pick(props.propsForMessage, [
      'direction',
      'serverTimestamp',
      'text',
      'timestamp',
      'previews',
      'quote',
      'attachments',
    ]),
  };

  return msgProps;
});

export const getMessageContentWithStatusesSelectorProps = createSelector(
  getMessagePropsByMessageId,
  (props): MessageContentWithStatusSelectorProps | undefined => {
    if (!props || isEmpty(props)) {
      return undefined;
    }

    const msgProps: MessageContentWithStatusSelectorProps = {
      ...pick(props.propsForMessage, ['conversationType', 'direction', 'isDeleted']),
    };

    return msgProps;
  }
);

export const getGenericReadableMessageSelectorProps = createSelector(
  getMessagePropsByMessageId,
  (props): GenericReadableMessageSelectorProps | undefined => {
    if (!props || isEmpty(props)) {
      return undefined;
    }

    const msgProps: GenericReadableMessageSelectorProps = pick(props.propsForMessage, [
      'convoId',
      'direction',
      'conversationType',
      'expirationLength',
      'expirationTimestamp',
      'isExpired',
      'isUnread',
      'receivedAt',
      'isKickedFromGroup',
      'isDeleted',
    ]);

    return msgProps;
  }
);

export const getOldTopMessageId = createSelector(
  getConversations,
  (state: ConversationsStateType): string | null => state.oldTopMessageId || null
);

// TODOLATER get rid of all the unneeded createSelector calls

export const getOldBottomMessageId = createSelector(
  getConversations,
  (state: ConversationsStateType): string | null => state.oldBottomMessageId || null
);

export const getIsSelectedConvoInitialLoadingInProgress = createSelector(
  getSelectedConversation,
  (convo: ReduxConversationType | undefined): boolean => Boolean(convo?.isInitialFetchingInProgress)
);

export function getCurrentlySelectedConversationOutsideRedux() {
  return window?.inboxStore?.getState().conversations.selectedConversation as string | undefined;
}
