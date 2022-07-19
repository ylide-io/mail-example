import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
    EverscaleReadingController,
    EverscaleSendingController,
} from "@ylide/everscale";
import {
    Ylide,
    BrowserLocalStorage,
    IGenericAccount,
    IMessage,
    MessageContentV3,
    YlideKeyStore,
    MessageChunks,
    MessageContainer,
} from "@ylide/sdk";

Ylide.registerReader(EverscaleReadingController);
Ylide.registerSender(EverscaleSendingController);

export function App() {
    const storage = useMemo(() => new BrowserLocalStorage(), []);
    const keystore = useMemo(
        () =>
            new YlideKeyStore(storage, {
                onPasswordRequest: async () => null,
                onDeriveRequest: async () => null,
            }),
        [storage]
    );

    const [isWalletAvailable, setIsWalletAvailable] = useState(false);
    const [sender, setSender] = useState<EverscaleSendingController | null>(
        null
    );
    const [reader, setReader] = useState<EverscaleReadingController | null>(
        null
    );
    const [account, setAccount] = useState<IGenericAccount | null>(null);
    const [keys, setKeys] = useState<YlideKeyStore["keys"]>([]);
    const [isKeyRegistered, setIsKeyRegistered] = useState(false);
    const [messages, setMessages] = useState<IMessage[]>([]);

    const [recipient, setRecipient] = useState("");
    const [subject, setSubject] = useState("");
    const [text, setText] = useState("");

    const handlePasswordRequest = useCallback(async (reason: string) => {
        return prompt(`Enter Ylide password for ${reason}`);
    }, []);

    const handleDeriveRequest = useCallback(
        async (
            reason: string,
            blockchain: string,
            address: string,
            magicString: string
        ) => {
            if (!sender) {
                return null;
            }
            try {
                return sender.deriveMessagingKeypair(magicString);
            } catch (err) {
                return null;
            }
        },
        [sender]
    );

    useEffect(() => {
        keystore.options.onPasswordRequest = handlePasswordRequest;
        keystore.options.onDeriveRequest = handleDeriveRequest;
    }, [handlePasswordRequest, handleDeriveRequest, keystore]);

    useEffect(() => {
        (async () => {
            const isAvailable =
                await EverscaleSendingController.isWalletAvailable();
            setIsWalletAvailable(isAvailable);
        })();
    }, []);

    useEffect(() => {
        if (!isWalletAvailable) {
            return;
        }
        (async () => {
            const _reader = await Ylide.instantiateReader(
                EverscaleReadingController,
                {
                    dev: true,
                }
            );
            const _sender = await Ylide.instantiateSender(
                EverscaleSendingController,
                {
                    dev: true,
                }
            );
            const _account = await _sender.getAuthenticatedAccount();

            await keystore.load();

            setReader(_reader as EverscaleReadingController);
            setSender(_sender as EverscaleSendingController);
            setAccount(_account);
            setKeys([...keystore.keys]);
        })();
    }, [isWalletAvailable, keystore]);

    useEffect(() => {
        if (!reader || !account || keys.length === 0) {
            return;
        }
        (async () => {
            const key = keys[0].key;
            const pk = await reader.extractPublicKeyFromAddress(
                account.address
            );
            if (!pk) {
                setIsKeyRegistered(false);
            } else {
                if (
                    pk.length === key.publicKey.length &&
                    pk.every((e, idx) => e === key.publicKey[idx])
                ) {
                    setIsKeyRegistered(true);
                } else {
                    setIsKeyRegistered(false);
                }
            }
        })();
    }, [account, keys, reader]);

    const connectAccount = useCallback(async () => {
        if (!sender) {
            return;
        }
        setAccount(await sender.requestAuthentication());
    }, [sender]);

    const disconnectAccount = useCallback(async () => {
        if (!sender) {
            return;
        }
        await sender.disconnectAccount();
        setAccount(null);
    }, [sender]);

    const createKey = useCallback(async () => {
        if (!account) {
            return;
        }
        const passwordForKey = prompt(`Enter password for creating first key`);
        if (!passwordForKey) {
            return;
        }
        const key = await keystore.create(
            "For your first key",
            "everscale",
            account.address,
            passwordForKey
        );
        await key.storeUnencrypted(passwordForKey);
        await keystore.save();
        setKeys([...keystore.keys]);
    }, [account, keystore]);

    const deleteKeys = useCallback(async () => {
        for (const key of keystore.keys) {
            await keystore.delete(key);
        }
        setKeys([...keystore.keys]);
    }, [keystore]);

    const registerPublicKey = useCallback(async () => {
        if (!keys.length || !sender) {
            return;
        }
        const key = keys[0].key;
        await sender.attachPublicKey(key.publicKey);
    }, [keys, sender]);

    const writeEmail = useCallback(async () => {
        if (!keys.length || !account || !reader || !sender) {
            return;
        }
        const content = MessageContentV3.plain(subject, text);
        const key = keys[0].key;
        await key.execute("Sending message", async (keypair) => {
            const recipientPublicKey = await reader.extractPublicKeyFromAddress(
                recipient
            );
            if (!recipientPublicKey) {
                throw new Error("Recipient public key not found");
            }
            await sender.sendMessage([0, 0, 0, 1], keypair, content, [
                {
                    address: recipient,
                    publicKey: recipientPublicKey,
                },
            ]);
        });
    }, [account, keys, reader, recipient, sender, subject, text]);

    const readMessages = useCallback(async () => {
        if (!reader || !account) {
            return;
        }
        const msgs = await reader.retrieveMessageHistoryByDates(
            account.address
        );
        setMessages(msgs);
    }, [reader, account]);

    const decryptMessage = useCallback(
        async (m: IMessage) => {
            if (!reader || !keys.length) {
                return;
            }
            const content = await reader.retrieveAndVerifyMessageContent(m);
            if (!content) {
                return alert("Content not found");
            }
            if (content.corrupted) {
                return alert("Content is corrupted");
            }
            const key = keys[0].key;
            const unpackedContent = await MessageChunks.unpackContentFromChunks(
                [content.content]
            );
            let symmKey;
            await key.execute("read mail", async (keypair) => {
                symmKey = keypair.decrypt(m.key, unpackedContent.publicKey);
            });
            if (!symmKey) {
                return alert("Decryption key is not accessable");
            }
            const decodedContent = MessageContainer.decodeContent(
                unpackedContent.content,
                symmKey
            );
            alert(decodedContent.subject + "\n\n" + decodedContent.content);
        },
        [keys, reader]
    );

    return (
        <div>
            {isWalletAvailable ? (
                <div>Wallet is available in the browser</div>
            ) : (
                <div>Wallet is not available in the browser</div>
            )}
            {account ? (
                <div>
                    Account connected: {account.address}
                    <button onClick={disconnectAccount}>
                        Disconnect account
                    </button>
                </div>
            ) : (
                <div>
                    No account connected.
                    <button onClick={connectAccount}>Connect account</button>
                </div>
            )}
            {keys.length ? (
                <div>
                    Keys: {keys.length}
                    <button onClick={deleteKeys}>Delete keys</button>
                </div>
            ) : (
                <div>
                    No keys created
                    <button onClick={createKey}>Create key</button>
                </div>
            )}
            {isKeyRegistered ? (
                <div>Your key is registered in blockchain</div>
            ) : (
                <div>
                    Your key is not registered in blockchain
                    <button onClick={registerPublicKey}>Register key</button>
                </div>
            )}
            {account && keys.length && isKeyRegistered ? (
                <div>
                    <input
                        type="text"
                        placeholder="Recipient"
                        id="recipient"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Subject"
                        id="subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                    />
                    <textarea
                        placeholder="Text"
                        id="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                    <button onClick={writeEmail}>Send</button>
                </div>
            ) : null}
            {account && keys.length && isKeyRegistered ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <button onClick={readMessages}>
                        Read messages from blockchain
                    </button>
                    {messages.map((m) => (
                        <div>
                            Message: {m.msgId.substring(0, 10)}...{" "}
                            {new Date(m.createdAt * 1000).toISOString()}
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    decryptMessage(m);
                                }}
                            >
                                Decrypt
                            </a>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default App;
