import React, {
    CSSProperties,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import "./App.css";
import {
    everscaleBlockchainFactory,
    everscaleWalletFactory,
} from "@ylide/everscale";
import {
    EthereumBlockchainController,
    evmFactories,
    EthereumWalletController,
    ethereumWalletFactory,
    EVMNetwork,
    EVM_NAMES,
} from "@ylide/ethereum";
import {
    Ylide,
    IGenericAccount,
    IMessage,
    MessageContentV3,
    YlideKeyStore,
    BrowserIframeStorage,
    MessagesList,
    BlockchainSourceSubjectType,
    AbstractWalletController,
    AbstractBlockchainController,
    WalletControllerFactory,
    YlideKeyPair,
    GenericEntry,
    BlockchainSource,
    BrowserLocalStorage,
} from "@ylide/sdk";
import moment from "moment";

Ylide.registerBlockchainFactory(evmFactories[EVMNetwork.LOCAL_HARDHAT]);
Ylide.registerBlockchainFactory(evmFactories[EVMNetwork.ETHEREUM]);
Ylide.registerBlockchainFactory(evmFactories[EVMNetwork.BNBCHAIN]);
Ylide.registerBlockchainFactory(everscaleBlockchainFactory);
Ylide.registerWalletFactory(ethereumWalletFactory);
Ylide.registerWalletFactory(everscaleWalletFactory);

const useListHandler = () => {
    const [messages, setMessages] = useState<
        GenericEntry<IMessage, BlockchainSource>[]
    >([]);
    const list = useMemo(() => new MessagesList(), []);

    useEffect(() => {
        const handler = () => setMessages([...list.getWindow()]);
        list.on("windowUpdate", handler);
        return () => {
            list.off("windowUpdate", handler);
        };
    }, [list]);

    return { messages, list };
};

export function App() {
    const { messages: inboxMessages, list: inbox } = useListHandler();
    const { messages: sentMessages, list: sent } = useListHandler();

    const storage = useMemo(() => new BrowserLocalStorage(), []);
    const keystore = useMemo(
        () =>
            new YlideKeyStore(storage, {
                onPasswordRequest: async () => null,
                onDeriveRequest: async () => null,
            }),
        [storage]
    );

    const [ylide, setYlide] = useState<Ylide | null>(null);
    const [walletsList, setWalletsList] = useState<
        { factory: WalletControllerFactory; isAvailable: boolean }[]
    >([]);
    const [accounts, setAccounts] = useState<
        { wallet: string; address: string }[]
    >(
        localStorage.getItem("accs")
            ? JSON.parse(localStorage.getItem("accs")!)
            : []
    );
    useEffect(() => {
        localStorage.setItem("accs", JSON.stringify(accounts));
    }, [accounts]);
    const [accountsState, setAccountsState] = useState<
        Record<
            string,
            {
                localKey: YlideKeyPair | null;
                remoteKey: Uint8Array | null;
                wallet: {
                    wallet: AbstractWalletController;
                    factory: WalletControllerFactory;
                } | null;
            }
        >
    >({});
    const [wallets, setWallets] = useState<
        { wallet: AbstractWalletController; factory: WalletControllerFactory }[]
    >([]);
    const [readers, setReaders] = useState<AbstractBlockchainController[]>([]);

    // const [sender, setSender] = useState<EthereumWalletController | null>(null);
    // const [reader, setReader] = useState<EthereumBlockchainController | null>(
    //     null
    // );
    const [keys, setKeys] = useState<YlideKeyStore["keys"]>([]);

    const [from, setFrom] = useState<string | null>(null);
    const [recipient, setRecipient] = useState("");
    const [subject, setSubject] = useState("");
    const [text, setText] = useState("");

    useEffect(() => {
        if (!ylide) {
            return;
        }
        (async () => {
            const availableWallets = await Ylide.getAvailableWallets();
            setWallets(
                await Promise.all(
                    availableWallets.map(async (w) => {
                        return {
                            factory: w,
                            wallet: await ylide.addWallet(
                                w.blockchainGroup,
                                w.wallet,
                                {
                                    dev: true,
                                    onNetworkSwitchRequest: async (
                                        reason: string,
                                        currentNetwork: EVMNetwork | undefined,
                                        needNetwork: EVMNetwork,
                                        needChainId: number
                                    ) => {
                                        alert(
                                            "Wrong network (" +
                                                (currentNetwork
                                                    ? EVM_NAMES[currentNetwork]
                                                    : "undefined") +
                                                "), switch to " +
                                                EVM_NAMES[needNetwork]
                                        );
                                    },
                                }
                            ),
                        };
                    })
                )
            );
            // console.log("seeeet");
        })();
    }, [ylide]);

    useEffect(() => {
        if (!wallets.length) {
            return;
        }
        (async () => {
            const result: Record<
                string,
                {
                    wallet: {
                        wallet: AbstractWalletController;
                        factory: WalletControllerFactory;
                    } | null;
                    localKey: YlideKeyPair | null;
                    remoteKey: Uint8Array | null;
                }
            > = {};
            for (let acc of accounts) {
                const wallet = wallets.find(
                    (w) => w.factory.wallet === acc.wallet
                );
                result[acc.address] = {
                    wallet: wallet || null,
                    localKey:
                        keys.find((k) => k.address === acc.address)?.key ||
                        null,
                    remoteKey:
                        (
                            await Promise.all(
                                readers.map(async (r) => {
                                    if (!r.isAddressValid(acc.address)) {
                                        return null;
                                    }
                                    const c =
                                        await r.extractPublicKeyFromAddress(
                                            acc.address
                                        );
                                    if (c) {
                                        return c.bytes;
                                    } else {
                                        return null;
                                    }
                                })
                            )
                        ).find((t) => !!t) || null,
                };
            }
            setAccountsState(result);
        })();
    }, [accounts, keys, readers, wallets]);

    useEffect(() => {
        (async () => {
            const list = Ylide.walletsList;
            const result: {
                factory: WalletControllerFactory;
                isAvailable: boolean;
            }[] = [];
            for (const { factory } of list) {
                result.push({
                    factory,
                    isAvailable: await factory.isWalletAvailable(),
                });
            }
            setWalletsList(result);
        })();
    }, []);

    const handlePasswordRequest = useCallback(async (reason: string) => {
        return prompt(`Enter Ylide password for ${reason}`);
    }, []);

    const handleDeriveRequest = useCallback(
        async (
            reason: string,
            blockchain: string,
            wallet: string,
            address: string,
            magicString: string
        ) => {
            const state = accountsState[address];
            if (!state) {
                return null;
            }
            try {
                return state.wallet!.wallet.signMagicString(magicString);
            } catch (err) {
                return null;
            }
        },
        [accountsState]
    );

    useEffect(() => {
        keystore.options.onPasswordRequest = handlePasswordRequest;
        keystore.options.onDeriveRequest = handleDeriveRequest;
    }, [handlePasswordRequest, handleDeriveRequest, keystore]);

    useEffect(() => {
        (async () => {
            await keystore.init();

            const _ylide = new Ylide(keystore);
            const _readers = [
                await _ylide.addBlockchain("everscale", {
                    dev: true,
                }),
                await _ylide.addBlockchain("LOCAL_HARDHAT"),
            ];

            // const blockchainController = await _ylide.addBlockchain(
            //     "everscale", // "LOCAL_HARDHAT"
            //     {
            //         dev: true,
            //     }
            // );
            // const walletController = await _ylide.addWallet(
            //     "everscale",
            //     "everwallet",
            //     {
            //         // "evm", "web3", {
            //         dev: true,
            //         onNetworkSwitchRequest: async (
            //             reason: string,
            //             currentNetwork: EVMNetwork | undefined,
            //             needNetwork: EVMNetwork,
            //             needChainId: number
            //         ) => {
            //             alert(
            //                 "Wrong network (" +
            //                     (currentNetwork
            //                         ? EVM_NAMES[currentNetwork]
            //                         : "undefined") +
            //                     "), switch to " +
            //                     EVM_NAMES[needNetwork]
            //             );
            //         },
            //     }
            // );

            // const rr = await _ylide.addBlockchain("LOCAL_HARDHAT", {
            //     dev: true,
            // });
            // const _account = await walletController.getAuthenticatedAccount();

            setYlide(_ylide);
            setReaders(_readers);
            // setReader(blockchainController as EthereumBlockchainController);
            // setSender(walletController as EthereumWalletController);
            // setAccount(_account);
            setKeys([...keystore.keys]);
        })();
    }, [inbox, keystore, sent]);

    // useEffect(() => {
    //     inbox.on("messages", ({ messages }) => {
    //         console.log("got inbox messages: ", messages);
    //     });
    // }, [inbox]);

    // useEffect(() => {
    //     (async () => {
    //         for (const reader of readers) {
    //             for (const account of accounts) {
    //                 const state = accountsState[account.address];
    //                 if (state && state.wallet) {
    //                     const msgs =
    //                         await reader.retrieveMessageHistoryByBounds(
    //                             state.wallet!.wallet.addressToUint256(
    //                                 account.address
    //                             )
    //                         );
    //                     const sentMsgs =
    //                         await reader.retrieveMessageHistoryByBounds(
    //                             Ylide.getSentAddress(
    //                                 state.wallet!.wallet.addressToUint256(
    //                                     account.address
    //                                 )
    //                             )
    //                         );
    //                     console.log(
    //                         `${account.address} in ${reader.constructor.name}: `,
    //                         msgs
    //                     );
    //                     // console.log(
    //                     //     `Sent from ${account.address} in ${reader.constructor.name}: `,
    //                     //     sentMsgs
    //                     // );
    //                 }
    //             }
    //         }
    //     })();
    // }, [accounts, accountsState, readers, sent]);

    useEffect(() => {
        for (const reader of readers) {
            for (const account of accounts) {
                const state = accountsState[account.address];
                if (state && state.wallet) {
                    // console.log(
                    //     "add: ",
                    //     reader.constructor.name,
                    //     account.address
                    // );

                    inbox.addReader(reader, {
                        address: state.wallet.wallet.addressToUint256(
                            account.address
                        ),
                        type: BlockchainSourceSubjectType.RECIPIENT,
                    });
                    sent.addReader(reader, {
                        type: BlockchainSourceSubjectType.RECIPIENT,
                        address: Ylide.getSentAddress(
                            state.wallet.wallet.addressToUint256(
                                account.address
                            )
                        ),
                    });
                } else {
                    console.log("not found: ", account.address);
                }
            }
        }

        inbox.readFirstPage();
        sent.readFirstPage();

        return () => {
            for (const reader of readers) {
                for (const account of accounts) {
                    const state = accountsState[account.address];
                    if (state && state.wallet) {
                        // console.log(
                        //     "remove: ",
                        //     reader.constructor.name,
                        //     account.address
                        // );
                        inbox.removeReader(reader, {
                            address: state.wallet.wallet.addressToUint256(
                                account.address
                            ),
                            type: BlockchainSourceSubjectType.RECIPIENT,
                        });
                        sent.removeReader(reader, {
                            type: BlockchainSourceSubjectType.RECIPIENT,
                            address: Ylide.getSentAddress(
                                state.wallet.wallet.addressToUint256(
                                    account.address
                                )
                            ),
                        });
                    }
                }
            }
        };
    }, [accounts, accountsState, inbox, readers, sent]);

    // useEffect(() => {
    //     (async () => {
    //         const isAvailable =
    //             await everscaleWalletFactory.isWalletAvailable();
    //         setIsWalletAvailable(isAvailable);
    //     })();
    // }, []);

    // useEffect(() => {
    //     if (!reader || !account || keys.length === 0) {
    //         return;
    //     }
    //     (async () => {
    //         const key = keys[0].key;
    //         const pk = await reader.extractPublicKeyFromAddress(
    //             account.address
    //         );
    //         if (!pk) {
    //             setIsKeyRegistered(false);
    //         } else {
    //             if (
    //                 pk.bytes.length === key.publicKey.length &&
    //                 pk.bytes.every((e, idx) => e === key.publicKey[idx])
    //             ) {
    //                 setIsKeyRegistered(true);
    //             } else {
    //                 setIsKeyRegistered(false);
    //             }
    //         }
    //     })();
    // }, [account, keys, reader]);

    // const connectAccount = useCallback(async () => {
    //     if (!sender) {
    //         return;
    //     }
    //     setAccount(await sender.requestAuthentication());
    // }, [sender]);

    // const disconnectAccount = useCallback(async () => {
    //     if (!sender) {
    //         return;
    //     }
    //     await sender.disconnectAccount();
    //     setAccount(null);
    // }, [sender]);

    // const createKey = useCallback(async () => {
    //     if (!account) {
    //         return;
    //     }
    //     const passwordForKey = prompt(`Enter password for creating first key`);
    //     if (!passwordForKey) {
    //         return;
    //     }
    //     const key = await keystore.create(
    //         "For your first key",
    //         "evm",
    //         "web3",
    //         account.address,
    //         passwordForKey
    //     );
    //     await key.storeUnencrypted(passwordForKey);
    //     await keystore.save();
    //     setKeys([...keystore.keys]);
    // }, [account, keystore]);

    // const deleteKeys = useCallback(async () => {
    //     for (const key of keystore.keys) {
    //         await keystore.delete(key);
    //     }
    //     setKeys([...keystore.keys]);
    // }, [keystore]);

    // const registerPublicKey = useCallback(async () => {
    //     if (!keys.length || !sender) {
    //         return;
    //     }
    //     const key = keys[0].key;
    //     await sender.attachPublicKey(key.publicKey, {
    //         network: EVMNetwork.LOCAL_HARDHAT,
    //     });
    // }, [keys, sender]);

    const send = useCallback(async () => {
        if (!ylide) {
            return;
        }
        const fromAccount = accounts.find((a) => a.address === from);
        if (!fromAccount) {
            return;
        }
        const state = accountsState[fromAccount.address];
        if (!state) {
            return;
        }
        const content = MessageContentV3.plain(subject, text);
        const msgId = await ylide.sendMessage(
            {
                wallet: state.wallet!.wallet,
                sender: (await state.wallet!.wallet.getAuthenticatedAccount())!,
                content,
                recipients: [recipient],
            },
            { network: EVMNetwork.LOCAL_HARDHAT }
        );
        alert(`Sent ${msgId}`);
    }, [accounts, accountsState, from, recipient, subject, text, ylide]);

    const row: CSSProperties = {
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        flexGrow: 1,
        flexBasis: 0,
    };
    const plate: CSSProperties = {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        flexGrow: 1,
        flexBasis: 0,
        padding: 10,
        border: "1px solid #e0e0e0",
    };
    const header: CSSProperties = {
        flexGrow: 0,
        flexShrink: 0,
        marginTop: 0,
        fontSize: 24,
        marginBottom: 0,
    };
    const container: CSSProperties = {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-start",
        overflowY: "auto",
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
    };
    const containerRow: CSSProperties = {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 40,
        borderBottom: "1px solid #f0f0f0",
    };

    const generateKey = useCallback(
        async (wallet: string, address: string) => {
            const account = accountsState[address];
            const password = await keystore.options.onPasswordRequest(
                `Generation key for ${address}`
            );
            if (!password) {
                return;
            }
            await keystore.create(
                `Generation key for ${address}`,
                account.wallet!.factory.blockchainGroup,
                wallet,
                address,
                password
            );
            document.location.reload();
        },
        [keystore, accountsState]
    );

    const publishKey = useCallback(
        async (wallet: string, address: string, key: Uint8Array) => {
            const account = accountsState[address];
            account.wallet!.wallet.attachPublicKey(key, {
                address,
                network: EVMNetwork.LOCAL_HARDHAT,
            });
        },
        [accountsState]
    );

    const addAccount = useCallback(
        async (factory: WalletControllerFactory) => {
            const tempWallet = await factory.create({
                onNetworkSwitchRequest: () => {},
            });
            const newAcc = await tempWallet.requestAuthentication();
            if (!newAcc) {
                alert("Auth was rejected");
                return;
            }
            const exists = accounts.some((a) => a.address === newAcc.address);
            if (exists) {
                alert("Already registered");
                return;
            }
            setAccounts(
                accounts.concat([
                    {
                        wallet: factory.wallet,
                        address: newAcc.address,
                    },
                ])
            );
        },
        [accounts]
    );

    const decryptMessage = useCallback(
        async (m: GenericEntry<IMessage, BlockchainSource>) => {
            if (!ylide) {
                return;
            }
            const reader = m.source.reader;
            const acc = accounts
                .map((account) => {
                    const accountUint256Address = accountsState[
                        account.address
                    ].wallet!.wallet.addressToUint256(account.address);
                    const sentAddress = Ylide.getSentAddress(
                        accountUint256Address
                    );

                    if (
                        accountUint256Address === m.link.recipientAddress ||
                        sentAddress === m.link.recipientAddress
                    ) {
                        return {
                            account,
                        };
                    }
                    return null;
                })
                .find((t) => !!t);
            console.log("acc: ", acc);
            if (!acc) {
                return;
            }
            const content = await reader.retrieveAndVerifyMessageContent(
                m.link
            );
            if (!content) {
                return alert("Content not found");
            }
            if (content.corrupted) {
                return alert("Content is corrupted");
            }
            const decodedContent = await ylide.decryptMessageContent(
                m.link,
                content,
                acc.account.address
            );
            alert(decodedContent.subject + "\n\n" + decodedContent.content);
        },
        [ylide, accounts, accountsState]
    );

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                width: "100vw",
                height: "100vh",
            }}
        >
            <div style={Object.assign({}, row, { flexGrow: 1 })}>
                <div
                    style={Object.assign(
                        { background: "rgba(255, 0, 0, 0.1) " },
                        plate
                    )}
                >
                    <div style={container}>
                        <h4
                            style={Object.assign({}, header, {
                                fontSize: 20,
                                marginBottom: 10,
                            })}
                        >
                            Wallets
                        </h4>
                        <table className="tiny-table">
                            <thead>
                                <tr>
                                    <th>Wallet</th>
                                    <th>Group</th>
                                    <th>Connect</th>
                                </tr>
                            </thead>
                            <tbody>
                                {walletsList.map(({ factory, isAvailable }) => (
                                    <tr key={factory.blockchainGroup}>
                                        <td>{factory.wallet}</td>
                                        <td>{factory.blockchainGroup}</td>
                                        <td>
                                            {isAvailable ? (
                                                <button
                                                    onClick={() =>
                                                        addAccount(factory)
                                                    }
                                                >
                                                    Add account
                                                </button>
                                            ) : (
                                                "Not available"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <h4
                            style={Object.assign({}, header, {
                                fontSize: 20,
                                marginBottom: 10,
                                marginTop: 20,
                            })}
                        >
                            Accounts
                        </h4>
                        <table className="tiny-table">
                            <thead>
                                <tr>
                                    <th>Wallet</th>
                                    <th>Address</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map(({ wallet, address }, idx) => {
                                    const state = accountsState[address];
                                    return (
                                        <tr key={idx}>
                                            <td>{wallet}</td>
                                            <td>
                                                <a
                                                    href="_blank"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        navigator.clipboard.writeText(
                                                            address
                                                        );
                                                    }}
                                                >
                                                    {address.substring(0, 6) +
                                                        "..." +
                                                        address.substring(
                                                            address.length - 6
                                                        )}
                                                </a>
                                            </td>
                                            <td>
                                                {state
                                                    ? state.localKey
                                                        ? state.remoteKey
                                                            ? state.remoteKey.every(
                                                                  (e, i) =>
                                                                      state.localKey!
                                                                          .publicKey[
                                                                          i
                                                                      ] === e
                                                              )
                                                                ? "Key is registered"
                                                                : "Local key does not match remote"
                                                            : "Key is not registered"
                                                        : "Key is not available"
                                                    : "No state"}
                                            </td>
                                            <td>
                                                {state ? (
                                                    state.localKey ? (
                                                        state.remoteKey ? (
                                                            state.remoteKey.every(
                                                                (e, i) =>
                                                                    state.localKey!
                                                                        .publicKey[
                                                                        i
                                                                    ] === e
                                                            ) ? null : (
                                                                <button
                                                                    onClick={() =>
                                                                        publishKey(
                                                                            wallet,
                                                                            address,
                                                                            state.localKey!
                                                                                .publicKey
                                                                        )
                                                                    }
                                                                >
                                                                    Replace key
                                                                </button>
                                                            )
                                                        ) : (
                                                            <button
                                                                onClick={() =>
                                                                    publishKey(
                                                                        wallet,
                                                                        address,
                                                                        state.localKey!
                                                                            .publicKey
                                                                    )
                                                                }
                                                            >
                                                                Register
                                                            </button>
                                                        )
                                                    ) : (
                                                        <button
                                                            onClick={() =>
                                                                generateKey(
                                                                    wallet,
                                                                    address
                                                                )
                                                            }
                                                        >
                                                            Generate
                                                        </button>
                                                    )
                                                ) : (
                                                    "No state"
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div
                    style={Object.assign(
                        { background: "rgba(0, 255, 0, 0.1) " },
                        plate
                    )}
                >
                    <h3 style={header}>Send message</h3>
                    <div style={container}>
                        <div style={containerRow}>
                            <div style={{ flexGrow: 0, flexBasis: 100 }}>
                                From:{" "}
                            </div>
                            <div
                                style={{
                                    flexGrow: 1,
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "flex-start",
                                }}
                            >
                                <select
                                    value={from || undefined}
                                    style={{ flexGrow: 1, flexShrink: 1 }}
                                    onChange={(e) =>
                                        setFrom(
                                            accounts.find(
                                                (a) =>
                                                    a.address === e.target.value
                                            )?.address || null
                                        )
                                    }
                                >
                                    {accounts.map((acc) => (
                                        <option
                                            value={acc.address}
                                            key={acc.address}
                                        >
                                            [{acc.wallet}] {acc.address}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div style={containerRow}>
                            <div style={{ flexGrow: 0, flexBasis: 100 }}>
                                To:{" "}
                            </div>
                            <div
                                style={{
                                    flexGrow: 1,
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "flex-start",
                                }}
                            >
                                <input
                                    value={recipient}
                                    onChange={(e) =>
                                        setRecipient(e.target.value)
                                    }
                                    style={{ flexGrow: 1, flexShrink: 1 }}
                                    placeholder="Address..."
                                />
                            </div>
                        </div>
                        <div style={containerRow}>
                            <div style={{ flexGrow: 0, flexBasis: 100 }}>
                                Subject:{" "}
                            </div>
                            <div
                                style={{
                                    flexGrow: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "flex-start",
                                }}
                            >
                                <input
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    style={{ flexGrow: 1, flexShrink: 1 }}
                                    placeholder="Subject..."
                                />
                            </div>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "stretch",
                                justifyContent: "flex-start",
                                paddingTop: 5,
                                flexGrow: 1,
                            }}
                        >
                            <div style={{ flexGrow: 0, marginBottom: 10 }}>
                                Text:{" "}
                            </div>
                            <div
                                style={{
                                    flexGrow: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                }}
                            >
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    style={{ flexGrow: 1 }}
                                    placeholder="Content..."
                                />
                            </div>
                        </div>
                        <div
                            style={Object.assign({}, containerRow, {
                                alignItems: "center",
                                justifyContent: "center",
                            })}
                        >
                            <button
                                onClick={() => send()}
                                style={{ width: 120, height: 30 }}
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div style={row}>
                <div
                    style={Object.assign(
                        { background: "rgba(0, 0, 255, 0.1) " },
                        plate
                    )}
                >
                    <h3 style={header}>Inbox</h3>
                    <table className="tiny-table">
                        <thead>
                            <tr>
                                <th>MsgID</th>
                                <th>Blockchain</th>
                                <th>Sender</th>
                                <th>Recipient</th>
                                <th>Date</th>
                                <th>View</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inboxMessages.map((m) => (
                                <tr key={m.link.msgId}>
                                    <td>{m.link.msgId.substring(0, 10)}...</td>
                                    <td>{m.link.blockchain}</td>
                                    <td>
                                        {m.link.senderAddress.substring(0, 10)}
                                        ...
                                    </td>
                                    <td>
                                        {m.link.recipientAddress.substring(
                                            0,
                                            10
                                        )}
                                        ...
                                    </td>
                                    <td>
                                        {moment(
                                            new Date(m.link.createdAt * 1000)
                                        ).format("HH:mm:ss DD.MM.YYYY")}
                                    </td>
                                    <td>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                decryptMessage(m);
                                            }}
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div
                    style={Object.assign(
                        { background: "rgba(255, 0, 255, 0.1) " },
                        plate
                    )}
                >
                    <h3 style={header}>Sent</h3>
                    <table className="tiny-table">
                        <thead>
                            <tr>
                                <th>MsgID</th>
                                <th>Blockchain</th>
                                <th>Sender</th>
                                <th>Recipient</th>
                                <th>Date</th>
                                <th>View</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sentMessages.map((m) => (
                                <tr key={m.link.msgId}>
                                    <td>{m.link.msgId.substring(0, 10)}...</td>
                                    <td>{m.link.blockchain}</td>
                                    <td>
                                        {m.link.senderAddress.substring(0, 10)}
                                        ...
                                    </td>
                                    <td>
                                        {m.link.recipientAddress.substring(
                                            0,
                                            10
                                        )}
                                        ...
                                    </td>
                                    <td>
                                        {moment(
                                            new Date(m.link.createdAt * 1000)
                                        ).format("HH:mm:ss DD.MM.YYYY")}
                                    </td>
                                    <td>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                decryptMessage(m);
                                            }}
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

//     {isWalletAvailable ? (
//     <div>Wallet is available in the browser</div>
// ) : (
//     <div>Wallet is not available in the browser</div>
// )}
// {account ? (
//     <div>
//         Account connected: {account.address}
//         <button onClick={disconnectAccount}>
//             Disconnect account
//         </button>
//     </div>
// ) : (
//     <div>
//         No account connected.
//         <button onClick={connectAccount}>Connect account</button>
//     </div>
// )}
// {keys.length ? (
//     <div>
//         Keys: {keys.length}
//         <button onClick={deleteKeys}>Delete keys</button>
//     </div>
// ) : (
//     <div>
//         No keys created
//         <button onClick={createKey}>Create key</button>
//     </div>
// )}
// {isKeyRegistered ? (
//     <div>Your key is registered in blockchain</div>
// ) : (
//     <div>
//         Your key is not registered in blockchain
//         <button onClick={registerPublicKey}>Register key</button>
//     </div>
// )}
// {account && keys.length && isKeyRegistered ? (
//     <div>
//         <input
//             type="text"
//             placeholder="Recipient"
//             id="recipient"
//             value={recipient}
//             onChange={(e) => setRecipient(e.target.value)}
//         />
//         <input
//             type="text"
//             placeholder="Subject"
//             id="subject"
//             value={subject}
//             onChange={(e) => setSubject(e.target.value)}
//         />
//         <textarea
//             placeholder="Text"
//             id="text"
//             value={text}
//             onChange={(e) => setText(e.target.value)}
//         />
//         <button onClick={writeMessage}>Send</button>
//     </div>
// ) : null}
// {account && keys.length && isKeyRegistered ? (
//     <div
//         style={{
//             display: "flex",
//             flexDirection: "row",
//             marginTop: 20,
//         }}
//     >
//         <div
//             style={{
//                 flexGrow: 1,
//                 flexBasis: 0,
//                 display: "flex",
//                 flexDirection: "column",
//             }}
//         >
//             <h3>Inbox:</h3>
//             {inboxMessages.map((m) => (
//                 <div>
//                     Msg: {m.msgId.substring(0, 10)}... , Sender:{" "}
//                     {m.senderAddress.substring(0, 10)}..., Date:{" "}
//                     {moment(new Date(m.createdAt * 1000)).format(
//                         "HH:mm:ss DD.MM.YYYY"
//                     )}
//                     <a
//                         href="_none"
//                         onClick={(e) => {
//                             e.preventDefault();
//                             decryptMessage(m);
//                         }}
//                     >
//                         Decrypt
//                     </a>
//                 </div>
//             ))}
//         </div>
//         <div
//             style={{
//                 flexGrow: 1,
//                 flexBasis: 0,
//                 display: "flex",
//                 flexDirection: "column",
//             }}
//         >
//             <h3>Sent:</h3>
//             {sentMessages.map((m) => (
//                 <div>
//                     Msg: {m.msgId.substring(0, 10)}... , Sender:{" "}
//                     {m.senderAddress.substring(0, 10)}..., Date:{" "}
//                     {moment(new Date(m.createdAt * 1000)).format(
//                         "HH:mm:ss DD.MM.YYYY"
//                     )}
//                     <a
//                         href="_none"
//                         onClick={(e) => {
//                             e.preventDefault();
//                             decryptMessage(m);
//                         }}
//                     >
//                         Decrypt
//                     </a>
//                 </div>
//             ))}
//         </div>
//     </div>
// ) : null}
// </div>

export default App;
