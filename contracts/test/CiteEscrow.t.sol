// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CiteEscrow} from "../src/CiteEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract CiteEscrowTest is Test {
    CiteEscrow internal escrow;
    MockUSDC internal usdc;

    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee");
    address internal stranger = makeAddr("stranger");

    bytes32 internal sourceId = keccak256("report-beilan");
    bytes32 internal contentHash = keccak256("beilan-q2");
    bytes32 internal answerId = keccak256("answer-1");
    bytes32 internal claimPaid = keccak256("claim-paid");
    bytes32 internal claimFlag = keccak256("claim-flag");
    bytes32 internal evidenceHash = keccak256("evidence-1");

    uint96 internal constant PRICE = 1_000_000; // 1 USDC
    uint16 internal constant FEE_BPS = 500; // 5%
    uint256 internal constant BUDGET = 5_000_000;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new CiteEscrow(address(usdc), address(this), FEE_BPS);
        escrow.registerSource(sourceId, payee, PRICE, contentHash);
        usdc.mint(payer, BUDGET);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(payer);
        escrow.deposit(answerId, BUDGET);
    }

    function test_settlePaysSourceAndFeeFromRegisteredPrice() public {
        escrow.settleClaim(answerId, claimPaid, sourceId, evidenceHash);

        uint256 fee = (uint256(PRICE) * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(payee), uint256(PRICE) - fee);
        assertEq(usdc.balanceOf(address(this)), fee);
        assertEq(escrow.budget(answerId), BUDGET - PRICE);
        assertTrue(escrow.claimDone(keccak256(abi.encode(answerId, claimPaid))));
    }

    function test_flagPaysNothingAndBlocksLaterSettle() public {
        uint256 payeeBefore = usdc.balanceOf(payee);
        escrow.flagClaim(answerId, claimFlag, sourceId, 1, evidenceHash);

        assertEq(usdc.balanceOf(payee), payeeBefore);
        assertEq(escrow.budget(answerId), BUDGET);

        vm.expectRevert(CiteEscrow.ClaimDone.selector);
        escrow.settleClaim(answerId, claimFlag, sourceId, evidenceHash);
    }

    function test_closeRefundsUnusedBudgetToPayer() public {
        escrow.settleClaim(answerId, claimPaid, sourceId, evidenceHash);
        uint256 payerBefore = usdc.balanceOf(payer);

        escrow.closeAnswer(answerId);

        assertEq(usdc.balanceOf(payer), payerBefore + (BUDGET - PRICE));
        assertEq(escrow.budget(answerId), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_strangerCannotRegisterSettleOrFlag() public {
        vm.startPrank(stranger);
        vm.expectRevert(CiteEscrow.NotOperator.selector);
        escrow.registerSource(keccak256("other"), stranger, PRICE, contentHash);
        vm.expectRevert(CiteEscrow.NotOperator.selector);
        escrow.settleClaim(answerId, claimPaid, sourceId, evidenceHash);
        vm.expectRevert(CiteEscrow.NotOperator.selector);
        escrow.flagClaim(answerId, claimFlag, sourceId, 1, evidenceHash);
        vm.stopPrank();
    }

    function test_budgetShortDoesNotPay() public {
        bytes32 poor = keccak256("poor");
        usdc.mint(payer, PRICE - 1);
        vm.startPrank(payer);
        escrow.deposit(poor, PRICE - 1);
        vm.stopPrank();

        vm.expectRevert(CiteEscrow.BudgetShort.selector);
        escrow.settleClaim(poor, claimPaid, sourceId, evidenceHash);
        assertEq(usdc.balanceOf(payee), 0);
    }

    function test_doubleSettleReverts() public {
        escrow.settleClaim(answerId, claimPaid, sourceId, evidenceHash);
        vm.expectRevert(CiteEscrow.ClaimDone.selector);
        escrow.settleClaim(answerId, claimPaid, sourceId, evidenceHash);
    }
}
