// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTTicketing is ERC721URIStorage, Ownable {
    // ========================= Constructor =============================
    constructor() ERC721("OnTix", "OTX") {}

    // ===================================================================

    // ======================== Global Variables =========================
    uint256 public nextEventId;
    uint256 public nextTicketId;
    // ===================================================================

    // ============================= Structs =============================
    struct Event {
        string name;
        string location;
        uint256 startTime;
        uint256 endTime;
        uint256 ticketPrice;
        uint256 maxTickets;
        uint256 resaleStart;
        uint256 resaleEnd;
        uint256 resalePriceCap;
        address creator;
        uint256 ticketsSold;
    }
    struct TicketData {
        uint256 eventId;
        bool isUsed;
        bool isResold;
    }
    // ====================================================================

    // ============================= Mappings =============================
    mapping(uint256 => Event) public events;
    mapping(uint256 => TicketData) public ticketMetadata;
    mapping(uint256 => uint256) public resalePrice;
    mapping(uint256 => address) public resaleSeller;
    mapping(uint256 => uint256) public eventProceeds;
    // ====================================================================

    // ============================= Events ===============================
    event EventCreated(uint256 indexed eventId, address indexed creator);
    event TicketPurchased(uint256 indexed ticketId, address indexed buyer);
    event TicketListedForResale(uint256 indexed ticketId, uint256 price);
    event TicketResold(uint256 indexed ticketId, address from, address to);
    event TicketValidated(uint256 indexed ticketId);
    event TicketTransferred(uint256 indexed ticketId, address from, address to);
    // ====================================================================

    // ============================= Modifiers ============================
    modifier onlyTicketOwner(uint256 ticketId) {
        require(ownerOf(ticketId) == msg.sender, "Not ticket owner");
        _;
    }
    modifier resaleTimeValid(uint256 ticketId) {
        uint256 eventId = ticketMetadata[ticketId].eventId;
        require(
            block.timestamp >= events[eventId].resaleStart &&
                block.timestamp <= events[eventId].resaleEnd,
            "Resale not allowed now"
        );
        _;
    }
    modifier onlyUnsold(uint256 ticketId) {
        require(!ticketMetadata[ticketId].isResold, "Already resold once");
        _;
    }
    modifier onlyUnvalidated(uint256 ticketId) {
        require(!ticketMetadata[ticketId].isUsed, "Ticket already used");
        _;
    }
    modifier withinPriceCap(uint256 ticketId, uint256 price) {
        uint256 eventId = ticketMetadata[ticketId].eventId;
        require(price <= events[eventId].resalePriceCap, "Exceeds price cap");
        _;
    }
    // ====================================================================

    // ============================= Functions ============================
    function createEvent(
        string memory name,
        string memory location,
        uint256 startTime,
        uint256 endTime,
        uint256 ticketPrice,
        uint256 maxTickets,
        uint256 resaleStart,
        uint256 resaleEnd,
        uint256 resalePriceCap
    ) external {
        require(startTime < endTime, "Invalid event time");
        require(resaleStart < resaleEnd, "Invalid resale window");
        require(resalePriceCap >= ticketPrice, "Cap must >= ticket price");

        events[nextEventId] = Event(
            name,
            location,
            startTime,
            endTime,
            ticketPrice,
            maxTickets,
            resaleStart,
            resaleEnd,
            resalePriceCap,
            msg.sender,
            0
        );

        emit EventCreated(nextEventId, msg.sender);
        nextEventId++;
    }

    function buyTickets(
        uint256 eventId,
        string[] memory tokenURIs
    ) external payable {
        Event storage evt = events[eventId];
        uint256 quantity = tokenURIs.length;
        require(
            evt.ticketsSold + quantity <= evt.maxTickets,
            "Not enough tickets"
        );
        require(
            msg.value == evt.ticketPrice * quantity,
            "Incorrect ETH amount"
        );

        for (uint256 i = 0; i < quantity; i++) {
            uint256 ticketId = nextTicketId;
            _safeMint(msg.sender, ticketId);
            _setTokenURI(ticketId, tokenURIs[i]);

            ticketMetadata[ticketId] = TicketData(eventId, false, false);
            emit TicketPurchased(ticketId, msg.sender);
            nextTicketId++;
        }

        evt.ticketsSold += quantity;
        eventProceeds[eventId] += msg.value;
    }

    function withdrawEventProceeds(uint256 eventId) external {
        Event storage evt = events[eventId];
        require(msg.sender == evt.creator, "Not event owner");

        uint256 balance = eventProceeds[eventId];
        require(balance > 0, "No funds to withdraw");

        eventProceeds[eventId] = 0;
        payable(msg.sender).transfer(balance);
    }

    function listForResale(
        uint256 ticketId,
        uint256 price
    )
        external
        onlyTicketOwner(ticketId)
        onlyUnsold(ticketId)
        resaleTimeValid(ticketId)
        withinPriceCap(ticketId, price)
    {
        resalePrice[ticketId] = price;
        resaleSeller[ticketId] = msg.sender;

        emit TicketListedForResale(ticketId, price);
    }

    function buyResaleTickets(uint256[] memory ticketIds) external payable {
        uint256 totalPrice = 0;

        for (uint256 i = 0; i < ticketIds.length; i++) {
            uint256 ticketId = ticketIds[i];
            address seller = resaleSeller[ticketId];
            require(seller != address(0), "Not listed");
            require(!ticketMetadata[ticketId].isResold, "Already resold");

            totalPrice += resalePrice[ticketId];
        }

        require(msg.value == totalPrice, "Incorrect ETH total");

        for (uint256 i = 0; i < ticketIds.length; i++) {
            uint256 ticketId = ticketIds[i];
            address seller = resaleSeller[ticketId];
            uint256 price = resalePrice[ticketId];

            _transfer(seller, msg.sender, ticketId);
            payable(seller).transfer(price);

            ticketMetadata[ticketId].isResold = true;
            resalePrice[ticketId] = 0;
            resaleSeller[ticketId] = address(0);

            emit TicketResold(ticketId, seller, msg.sender);
        }
    }

    function transferTickets(address to, uint256[] memory ticketIds) external {
        for (uint256 i = 0; i < ticketIds.length; i++) {
            uint256 ticketId = ticketIds[i];
            require(ownerOf(ticketId) == msg.sender, "Not owner");
            require(!ticketMetadata[ticketId].isResold, "Already resold");

            uint256 eventId = ticketMetadata[ticketId].eventId;
            require(
                block.timestamp >= events[eventId].resaleStart &&
                    block.timestamp <= events[eventId].resaleEnd,
                "Transfer not allowed now"
            );

            _transfer(msg.sender, to, ticketId);
            ticketMetadata[ticketId].isResold = true;

            emit TicketTransferred(ticketId, msg.sender, to);
        }
    }

    function validateTicket(
        uint256 ticketId
    ) external onlyTicketOwner(ticketId) onlyUnvalidated(ticketId) {
        ticketMetadata[ticketId].isUsed = true;

        emit TicketValidated(ticketId);
    }
    // ====================================================================
}
