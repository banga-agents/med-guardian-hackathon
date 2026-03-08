// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
pragma solidity ^0.8.19;

import {IERC165} from "./IERC165.sol";

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
