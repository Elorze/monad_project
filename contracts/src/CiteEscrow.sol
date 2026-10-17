// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice 托管预算，按来源单价结算 SUPPORTED claim，并把证据哈希记在事件里。
/// 判定对错不在链上。operator 是中心化核实者。
contract CiteEscrow {
    struct Source {
        address payee;
        uint96 pricePerClaim;
        bytes32 contentHash;
        bool active;
    }

    IERC20 public immutable usdc;
    address public operator;
    address public feeRecipient;
    uint16 public feeBps;

    mapping(bytes32 => Source) public sources;
    mapping(bytes32 => uint256) public budget;
    mapping(bytes32 => address) public payerOf;
    mapping(bytes32 => bool) public claimDone;

    error NotOperator();
    error SourceInactive();
    error AnswerExists();
    error ZeroAmount();
    error UnknownAnswer();
    error ClaimDone();
    error BudgetShort();
    error TransferFailed();
    error NotPayer();

    event SourceRegistered(bytes32 indexed sourceId, address payee, uint96 price, bytes32 contentHash);
    event Deposited(bytes32 indexed answerId, address indexed payer, uint256 amount);
    event ClaimSettled(
        bytes32 indexed answerId,
        bytes32 claimId,
        bytes32 indexed sourceId,
        address payee,
        uint256 amount,
        uint256 fee,
        bytes32 evidenceHash
    );
    event ClaimFlagged(
        bytes32 indexed answerId,
        bytes32 claimId,
        bytes32 indexed sourceId,
        uint8 verdict,
        bytes32 evidenceHash
    );
    event AnswerClosed(bytes32 indexed answerId, uint256 refunded);

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address usdc_, address feeRecipient_, uint16 feeBps_) {
        usdc = IERC20(usdc_);
        operator = msg.sender;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    function registerSource(bytes32 sourceId, address payee, uint96 price, bytes32 contentHash) external onlyOperator {
        sources[sourceId] = Source({payee: payee, pricePerClaim: price, contentHash: contentHash, active: true});
        emit SourceRegistered(sourceId, payee, price, contentHash);
    }

    function deposit(bytes32 answerId, uint256 amount) external {
        if (payerOf[answerId] != address(0)) revert AnswerExists();
        if (amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        payerOf[answerId] = msg.sender;
        budget[answerId] = amount;
        emit Deposited(answerId, msg.sender, amount);
    }

    /// @dev 金额只读来源单价，不接受调用者传入的数额。
    function settleClaim(bytes32 answerId, bytes32 claimId, bytes32 sourceId, bytes32 evidenceHash)
        external
        onlyOperator
    {
        bytes32 key = keccak256(abi.encode(answerId, claimId));
        if (claimDone[key]) revert ClaimDone();
        if (payerOf[answerId] == address(0)) revert UnknownAnswer();

        Source memory source = sources[sourceId];
        if (!source.active) revert SourceInactive();

        uint256 price = source.pricePerClaim;
        if (budget[answerId] < price) revert BudgetShort();

        claimDone[key] = true;
        uint256 fee = (price * feeBps) / 10_000;
        uint256 payout = price - fee;
        budget[answerId] -= price;

        if (!usdc.transfer(source.payee, payout)) revert TransferFailed();
        if (fee > 0 && !usdc.transfer(feeRecipient, fee)) revert TransferFailed();

        emit ClaimSettled(answerId, claimId, sourceId, source.payee, payout, fee, evidenceHash);
    }

    function flagClaim(bytes32 answerId, bytes32 claimId, bytes32 sourceId, uint8 verdict, bytes32 evidenceHash)
        external
        onlyOperator
    {
        bytes32 key = keccak256(abi.encode(answerId, claimId));
        if (claimDone[key]) revert ClaimDone();
        if (payerOf[answerId] == address(0)) revert UnknownAnswer();
        claimDone[key] = true;
        emit ClaimFlagged(answerId, claimId, sourceId, verdict, evidenceHash);
    }

    function closeAnswer(bytes32 answerId) external {
        address payer = payerOf[answerId];
        if (payer == address(0)) revert UnknownAnswer();
        if (msg.sender != payer && msg.sender != operator) revert NotPayer();
        uint256 refund = budget[answerId];
        budget[answerId] = 0;
        if (refund > 0 && !usdc.transfer(payer, refund)) revert TransferFailed();
        emit AnswerClosed(answerId, refund);
    }
}
