import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
    EverscaleBlockchainController,
    everscaleBlockchainFactory,
    EverscaleWalletController,
    everscaleWalletFactory,
} from "@ylide/everscale";
import {
    Ylide,
    IGenericAccount,
    IMessage,
    MessageContentV3,
    YlideKeyStore,
    BrowserIframeStorage,
    sha256,
} from "@ylide/sdk";

Ylide.registerBlockchainFactory(everscaleBlockchainFactory);
Ylide.registerWalletFactory(everscaleWalletFactory);

export function App() {
    const storage = useMemo(() => new BrowserIframeStorage(), []);
    const keystore = useMemo(
        () =>
            new YlideKeyStore(storage, {
                onPasswordRequest: async () => null,
                onDeriveRequest: async () => null,
            }),
        [storage]
    );

    const [isWalletAvailable, setIsWalletAvailable] = useState(false);
    const [ylide, setYlide] = useState<Ylide | null>(null);
    const [sender, setSender] = useState<EverscaleWalletController | null>(
        null
    );
    const [reader, setReader] = useState<EverscaleBlockchainController | null>(
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
                return sender.signMagicString(magicString);
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
                await everscaleWalletFactory.isWalletAvailable();
            setIsWalletAvailable(isAvailable);
        })();
    }, []);

    useEffect(() => {
        if (!isWalletAvailable) {
            return;
        }
        (async () => {
            await keystore.init();

            const _ylide = new Ylide(keystore);
            const { blockchainController, walletController } =
                await _ylide.addWallet("everscale", "everwallet", {
                    dev: true,
                });
            const _account = await walletController.getAuthenticatedAccount();

            setYlide(_ylide);
            setReader(blockchainController as EverscaleBlockchainController);
            setSender(walletController as EverscaleWalletController);
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
                    pk.bytes.length === key.publicKey.length &&
                    pk.bytes.every((e, idx) => e === key.publicKey[idx])
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
            "everwallet",
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

    const writeMessage = useCallback(async () => {
        if (!keys.length || !account || !reader || !sender || !ylide) {
            return;
        }
        const content = MessageContentV3.plain(subject, text);
        const msgId = await ylide.sendMessage({
            wallet: sender,
            sender: account,
            content,
            recipients: [recipient],
        });
        alert(`Sent ${msgId}`);
    }, [account, keys.length, reader, recipient, sender, subject, text, ylide]);

    const readMessages = useCallback(async () => {
        if (!reader || !account) {
            return;
        }
        const msgs = await reader.retrieveMessageHistoryByDates(
            account.address
        );
        setMessages(msgs);
    }, [reader, account]);

    const readSentMessages = useCallback(async () => {
        if (!reader || !account) {
            return;
        }
        const msgs = await reader.retrieveMessageHistoryByDates(
            reader.uint256ToAddress(sha256(account.address))
        );
        setMessages(msgs);
    }, [reader, account]);

    const decryptMessage = useCallback(
        async (m: IMessage) => {
            if (!reader || !keys.length || !account || !ylide) {
                return;
            }
            const content = await reader.retrieveAndVerifyMessageContent(m);
            if (!content) {
                return alert("Content not found");
            }
            if (content.corrupted) {
                return alert("Content is corrupted");
            }
            const decodedContent = await ylide.decryptMessageContent(
                m,
                content,
                account.address
            );
            alert(decodedContent.subject + "\n\n" + decodedContent.content);
        },
        [keys, reader, account, ylide]
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
                    <button onClick={writeMessage}>Send</button>
                </div>
            ) : null}
            {account && keys.length && isKeyRegistered ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <button onClick={readMessages}>
                        Read messages from blockchain
                    </button>
                    <button onClick={readSentMessages}>
                        Read sent messages from blockchain
                    </button>
                    {messages.map((m) => (
                        <div>
                            Message: {m.msgId.substring(0, 10)}...{" "}
                            {new Date(m.createdAt * 1000).toISOString()}
                            <a
                                href="_none"
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
