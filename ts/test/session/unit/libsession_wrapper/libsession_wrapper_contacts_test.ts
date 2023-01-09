import { expect } from 'chai';

import { from_hex, from_string } from 'libsodium-wrappers-sumo';
import * as SessionUtilWrapper from 'session_util_wrapper';

// tslint:disable: chai-vague-errors no-unused-expression no-http-string no-octal-literal whitespace

describe('libsession_wrapper_contacts  ', () => {
  // Note: To run this test, you need to compile the libsession wrapper for node (and not for electron).
  // To do this, you can cd to the node_module/libsession_wrapper folder and do
  // yarn configure && yarn build
  // once that is done, you can rename this file and remove the _skip suffix so that test is run.

  // We have to disable it by filename as nodejs tries to load the module during the import step above, and fails as it is not compiled for nodejs but for electron.

  it('[config][contacts]', () => {
    const edSecretKey = from_hex(
      '0123456789abcdef0123456789abcdef000000000000000000000000000000004cb76fdc6d32278e3f83dbf608360ecc6b65727934b85d2fb86862ff98c46ab7'
    );

    // Initialize a brand new, empty config because we have no dump data to deal with.
    const contacts = new SessionUtilWrapper.ContactsConfigWrapper(edSecretKey, null);

    // We don't need to push anything, since this is an empty config
    expect(contacts.needsPush()).to.be.eql(false);
    expect(contacts.needsDump()).to.be.eql(false);
    const real_id = '050000000000000000000000000000000000000000000000000000000000000000';

    // Since it's empty there shouldn't be a get result.
    expect(contacts.get(real_id)).to.be.null;

    const created = contacts.getOrCreate(real_id);

    expect(created).to.be.not.null;

    expect(created.id).to.be.eq(real_id);
    expect(created.name).to.be.null;
    expect(created.nickname).to.be.null;
    expect(created.approved).to.be.eq(false);
    expect(created.approvedMe).to.be.eq(false);
    expect(created.blocked).to.be.eq(false);
    expect(created.id).to.be.eq(real_id);

    expect(contacts.needsPush()).to.be.eql(false);
    expect(contacts.needsDump()).to.be.eql(false);

    expect(contacts.push().seqno === 0);

    created.name = 'Joe';
    created.nickname = 'Joey';
    created.approved = true;
    created.approvedMe = true;
    contacts.set(created);

    let updated = contacts.get(real_id);
    expect(updated).to.not.be.null;
    expect(updated).to.not.be.undefined;

    expect(updated?.id).to.be.eq(real_id);
    expect(updated?.name).to.be.eq('Joe');
    expect(updated?.nickname).to.be.eq('Joey');
    expect(updated?.approved).to.be.true;
    expect(updated?.approvedMe).to.be.true;
    expect(updated?.blocked).to.be.false;
    expect(updated?.profilePicture).to.be.undefined;

    created.profilePicture = { key: new Uint8Array([1, 2, 3]), url: 'fakeUrl' };
    contacts.set(created);
    updated = contacts.get(real_id);

    expect(updated?.profilePicture?.url).to.be.deep.eq('fakeUrl');
    expect(updated?.profilePicture?.key).to.be.deep.eq(new Uint8Array([1, 2, 3]));

    expect(contacts.needsPush()).to.be.eql(true);
    expect(contacts.needsDump()).to.be.eql(true);

    let push1 = contacts.push();
    expect(push1.seqno).to.be.eq(1);

    // Pretend we uploaded it
    contacts.confirmPushed(push1.seqno);
    expect(contacts.needsPush()).to.be.eql(false);
    expect(contacts.needsDump()).to.be.eql(true);

    const dump = contacts.dump();

    const contacts2 = new SessionUtilWrapper.ContactsConfigWrapper(edSecretKey, dump);

    expect(contacts2.needsPush()).to.be.eql(false);
    expect(contacts2.needsDump()).to.be.eql(false);
    expect(contacts2.push().seqno).to.be.eq(1);
    // Because we just called dump() above, to load up
    // contacts2.
    expect(contacts2.needsDump()).to.be.eql(false);

    const x = contacts2.get(real_id);
    expect(x?.id).to.be.eq(real_id);
    expect(x?.name).to.be.eq('Joe');
    expect(x?.nickname).to.be.eq('Joey');
    expect(x?.approved).to.be.true;
    expect(x?.approvedMe).to.be.true;
    expect(x?.blocked).to.be.false;

    const another_id = '051111111111111111111111111111111111111111111111111111111111111111';
    contacts2.getOrCreate(another_id);
    contacts2.set({
      id: another_id,
    });
    // We're not setting any fields, but we should still keep a record of the session id
    expect(contacts2.needsPush()).to.be.true;

    let push2 = contacts2.push();
    push1.seqno = push2.seqno;
    push1.data = push2.data;
    expect(push1.seqno).to.be.equal(2);
    contacts.merge([push1.data]);

    contacts2.confirmPushed(push1.seqno);
    expect(contacts.needsPush()).to.be.false;
    expect(contacts.push().seqno).to.be.eq(push1.seqno);

    // Iterate through and make sure we got everything we expected
    const allContacts = contacts.getAll();
    const session_ids = allContacts.map(m => m.id);
    const nicknames = allContacts.map(m => m.nickname || '(N/A)');

    expect(session_ids.length).to.be.eq(2);
    expect(session_ids).to.be.deep.eq([real_id, another_id]);
    expect(nicknames).to.be.deep.eq(['Joey', '(N/A)']);

    // Conflict! Oh no!

    // On client 1 delete a contact:
    contacts.erase(real_id);
    const shouldBeErased = contacts.get(real_id);
    expect(shouldBeErased).to.be.null;

    // Client 2 adds a new friend:
    const third_id = '052222222222222222222222222222222222222222222222222222222222222222';
    contacts2.setNickname(third_id, 'Nickname 3');
    contacts2.setApproved(third_id, true);
    contacts2.setBlocked(third_id, true);
    contacts2.setProfilePic(third_id, 'http://example.com/huge.bmp', from_string('qwerty'));

    expect(contacts.needsPush()).to.be.true;
    expect(contacts2.needsPush()).to.be.true;

    push1 = contacts.push();
    push2 = contacts2.push();

    expect(push1.seqno).to.be.eq(push2.seqno);
    expect(push1.data).to.not.be.deep.eq(push2.data);
    contacts.confirmPushed(push1.seqno);
    contacts2.confirmPushed(push2.seqno);

    contacts.merge([push2.data]);
    expect(contacts.needsPush()).to.be.true;

    contacts2.merge([push1.data]);
    expect(contacts2.needsPush()).to.be.true;

    push1 = contacts.push();
    expect(push1.seqno).to.be.eq(push2.seqno + 1);
    push2 = contacts2.push();

    expect(push1.seqno).to.be.deep.eq(push2.seqno);
    expect(push1.data).to.be.deep.eq(push2.data);

    contacts.confirmPushed(push1.seqno);
    contacts2.confirmPushed(push2.seqno);

    expect(contacts.needsPush()).to.be.false;
    expect(contacts2.needsPush()).to.be.false;

    const allContacts2 = contacts.getAll();
    const session_ids2 = allContacts2.map(m => m.id);
    const nicknames2 = allContacts2.map(m => m.nickname || '(N/A)');

    expect(session_ids2.length).to.be.eq(2);
    expect(nicknames2.length).to.be.eq(2);
    expect(session_ids2).to.be.deep.eq([another_id, third_id]);
    expect(nicknames2).to.be.deep.eq(['(N/A)', 'Nickname 3']);
  });

  it('[config][contacts][c]', () => {
    const edSecretKey = from_hex(
      '0123456789abcdef0123456789abcdef000000000000000000000000000000004cb76fdc6d32278e3f83dbf608360ecc6b65727934b85d2fb86862ff98c46ab7'
    );

    // Initialize a brand new, empty config because we have no dump data to deal with.
    const contacts = new SessionUtilWrapper.ContactsConfigWrapper(edSecretKey, null);

    const real_id = '050000000000000000000000000000000000000000000000000000000000000000';

    expect(contacts.get(real_id)).to.be.null;
    const c = contacts.getOrCreate(real_id);
    expect(c.id).to.be.eq(real_id);
    expect(c.name).to.be.null;
    expect(c.nickname).to.be.null;
    expect(c.approved).to.be.false;
    expect(c.approvedMe).to.be.false;
    expect(c.blocked).to.be.false;
    expect(c.profilePicture?.key).to.be.undefined;
    expect(c.profilePicture?.url).to.be.undefined;

    c.name = 'Joe';
    c.nickname = 'Joey';
    c.approved = true;
    c.approvedMe = true;
    contacts.set(c); // FIXME use .set when ready
    // contacts.setName(real_id, c.name);
    // contacts.setNickname(real_id, c.nickname);
    // contacts.setApproved(real_id, c.approved);
    // contacts.setApprovedMe(real_id, c.approvedMe);

    const c2 = contacts.getOrCreate(real_id);
    expect(c2.name).to.be.eq('Joe');
    expect(c2.nickname).to.be.eq('Joey');
    expect(c2.approved).to.be.true;
    expect(c2.approvedMe).to.be.true;
    expect(c2.blocked).to.be.false;
    expect(c2.profilePicture?.key).to.be.undefined;
    expect(c2.profilePicture?.url).to.be.undefined;

    expect(contacts.needsDump()).to.be.true;
    expect(contacts.needsPush()).to.be.true;

    let push1 = contacts.push();
    expect(push1.seqno).to.be.equal(1);

    const contacts2 = new SessionUtilWrapper.ContactsConfigWrapper(edSecretKey, null);

    let accepted = contacts2.merge([push1.data]);
    expect(accepted).to.be.equal(1);

    contacts.confirmPushed(push1.seqno);

    let c3 = contacts2.getOrCreate(real_id);
    expect(c3.name).to.be.eq('Joe');
    expect(c3.nickname).to.be.eq('Joey');
    expect(c3.approved).to.be.true;
    expect(c3.approvedMe).to.be.true;
    expect(c3.blocked).to.be.false;
    expect(c3.profilePicture?.key).to.be.undefined;
    expect(c3.profilePicture?.url).to.be.undefined;

    const another_id = '051111111111111111111111111111111111111111111111111111111111111111';
    c3 = contacts.getOrCreate(another_id);
    expect(c3.name).to.be.null;
    expect(c3.nickname).to.be.null;
    expect(c3.approved).to.be.false;
    expect(c3.approvedMe).to.be.false;
    expect(c3.blocked).to.be.false;

    expect(c3.profilePicture?.key).to.be.undefined;
    expect(c3.profilePicture?.url).to.be.undefined;

    contacts2.set(c3);

    let push2 = contacts2.push();
    accepted = contacts.merge([push2.data]);
    expect(accepted).to.be.equal(1);

    const allContacts2 = contacts.getAll();
    const session_ids2 = allContacts2.map(m => m.id);
    const nicknames2 = allContacts2.map(m => m.nickname || '(N/A)');

    expect(session_ids2.length).to.be.eq(2);
    expect(nicknames2.length).to.be.eq(2);
    expect(session_ids2).to.be.deep.eq([real_id, another_id]);
    expect(nicknames2).to.be.deep.eq(['Joey', '(N/A)']);

    // Changing things while iterating:
    // no need to support this in JS for now.

    const allContacts3 = contacts.getAll();
    let deletions = 0;
    let non_deletions = 0;
    allContacts3.forEach(c => {
      if (c.id !== real_id) {
        contacts.erase(c.id);
        deletions++;
      } else {
        non_deletions++;
      }
    });

    expect(deletions).to.be.eq(1);
    expect(non_deletions).to.be.eq(1);
    expect(contacts.get(real_id)).to.exist;
    expect(contacts.get(another_id)).to.be.null;
  });
});
