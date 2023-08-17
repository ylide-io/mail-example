import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { tvm } from "@ylide/everscale";
import { evm } from "@ylide/ethereum";
import {
    Ylide,
    WalletAccount,
    IMessageWithSource,
    ListSourceDrainer,
} from "@ylide/sdk";

const ylide = new Ylide();

ylide.add(evm);
ylide.add(tvm);

const Button = ({ onClick, title, disabled }: any) => (
    <a
        href="#btn"
        className={disabled ? "disabled" : ""}
        onClick={(e) => {
            e.preventDefault();
            onClick();
        }}
    >
        {title}
    </a>
);

function AuthBlock({ account }: { account: WalletAccount }) {
    const [isLogged, setIsLogged] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);

    const updateLoginStatus = useCallback(async (acc: WalletAccount | null) => {
        if (!acc) {
            setIsLogged(false);
            setIsRegistered(false);
            return;
        }
        const [_isLogged, _isRegistered] = await Promise.all([
            ylide.auth.isAuthorized(acc),
            ylide.auth.isRegistered(acc),
        ]);
        setIsLogged(_isLogged);
        setIsRegistered(_isRegistered);
    }, []);

    useEffect(
        () => void updateLoginStatus(account),
        [account, updateLoginStatus]
    );

    const register = useCallback(async () => {
        await ylide.auth.register(account);
        await updateLoginStatus(account);
    }, [account, updateLoginStatus]);

    const login = useCallback(async () => {
        await ylide.auth.login(account);
        await updateLoginStatus(account);
    }, [account, updateLoginStatus]);

    return isLogged ? (
        <>Account is registered and logged in</>
    ) : isRegistered ? (
        <>
            Account is registered but not logged in.{" "}
            <Button onClick={login} title="Login" />
        </>
    ) : (
        <>
            Account is not registered.{" "}
            <Button onClick={register} title="Register" />
        </>
    );
}

function MessagesBlock({ account }: { account: WalletAccount }) {
    const [messages, setMessages] = useState<IMessageWithSource[]>([]);

    const [loading, setLoading] = useState(true);
    const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
    const mailbox = useRef<
        { list: ListSourceDrainer; dispose: () => void } | undefined
    >(undefined);

    const updateMailbox = useCallback(async () => {
        if (mailbox.current) {
            mailbox.current.dispose();
        }
        setLoading(true);
        let newMailbox;
        if (folder === "inbox") {
            newMailbox = await ylide.mailbox.inbox([account]);
        } else {
            newMailbox = await ylide.mailbox.sent([account]);
        }
        mailbox.current = newMailbox;
        setMessages(newMailbox.list.messages);
        setLoading(false);
    }, [account, folder]);

    useEffect(() => {
        updateMailbox();
    }, [updateMailbox]);

    const showContent = useCallback(async (m: IMessageWithSource) => {
        const decrypted = await ylide.mailbox.decrypt(m);
        const { subject, content } = decrypted.content;
        const text =
            typeof content === "string" ? content : content.toPlainText();
        alert(`Subject: ${subject}\n\nBody: ${text}`);
    }, []);

    return (
        <div className="block">
            <h3>Messages</h3>
            <div>
                <Button
                    title="Inbox"
                    disabled={folder === "inbox"}
                    onClick={() => setFolder("inbox")}
                />
                &nbsp;|&nbsp;
                <Button
                    title="Sent"
                    disabled={folder === "sent"}
                    onClick={() => setFolder("sent")}
                />
            </div>
            {loading ? (
                "Loading..."
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Message ID</th>
                            <th>Sender</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {messages.map((m) => (
                            <tr key={m.msg.msgId}>
                                <td>{m.msg.msgId}</td>
                                <td>{m.msg.senderAddress}</td>
                                <td>
                                    {new Date(
                                        m.msg.createdAt * 1000
                                    ).toLocaleString()}
                                </td>
                                <td>
                                    <Button
                                        title="Show content"
                                        onClick={() => showContent(m)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export function App() {
    const [isInited, setIsInited] = useState(false);
    // accounts:
    const [account, setAccount] = useState<WalletAccount | null>(null);

    const isMetaMaskAvailable = ylide.controllers.wallets.some(
        (w) => w.wallet() === "metamask"
    );
    const isVenomWalletAvailable = ylide.controllers.wallets.some(
        (w) => w.wallet() === "venomwallet"
    );

    const connectWallet = useCallback(async (walletName: string) => {
        const wallet = ylide.controllers.wallets.find(
            (w) => w.wallet() === walletName
        )!;

        const newAccount = await wallet.requestAuthentication();
        if (!newAccount) {
            return;
        }

        setAccount(newAccount);
    }, []);

    const disconnect = useCallback(async () => {
        if (!account) {
            return;
        }
        const wallet = ylide.controllers.wallets.find(
            (w) =>
                w.wallet() === account.wallet &&
                w.blockchainGroup() === account.blockchainGroup
        );
        if (wallet) {
            await wallet.disconnectAccount(account);
        }
        setAccount(null);
    }, [account]);

    useEffect(() => {
        ylide
            .init()
            .then(() => setIsInited(true))
            .catch((err) => alert(`Initialization error: ${err.message}`));
    }, []);

    if (!isInited) {
        return <div className="app">Initializing...</div>;
    }

    return (
        <div className="app">
            <div className="block">
                <h3>Account</h3>
                <div>
                    {account ? (
                        <div>
                            {account.address}{" "}
                            <Button onClick={disconnect} title="Disconnect" />
                            <br />
                            <AuthBlock account={account} />
                        </div>
                    ) : (
                        <>
                            <Button
                                disabled={!isMetaMaskAvailable}
                                onClick={() => connectWallet("metamask")}
                                title="Login via MetaMask"
                            />
                            &nbsp;&nbsp;&nbsp;
                            <Button
                                disabled={!isVenomWalletAvailable}
                                onClick={() => connectWallet("venomwallet")}
                                title="Login via VenomWallet"
                            />
                        </>
                    )}
                </div>
            </div>
            {account && <MessagesBlock account={account} />}
        </div>
    );
}
